import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { needsProcedureDetails } from '../domain/workflow';
import { sharePdf } from '../native/reliableSharing';
import type { CompletionRecord } from '../types';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function buildReportHtml(record: CompletionRecord): string {
  const { profile, client, procedure, completedAt } = record;
  const details = needsProcedureDetails(procedure.task)
    ? `${row('Size', procedure.size ?? '')}${row('Side', procedure.side ?? '')}${row('Location', procedure.location ?? '')}`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page { margin: 42px; }
body { color: #1b2b38; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; }
.letterhead { border-bottom: 4px solid #008a8c; padding-bottom: 18px; margin-bottom: 28px; }
.brand { color: #12283f; font-size: 28px; font-weight: 800; letter-spacing: 2px; }
.tagline { color: #647480; margin-top: 5px; }
h1 { color: #12283f; font-size: 22px; margin: 0 0 22px; }
h2 { color: #008a8c; font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; margin: 24px 0 8px; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid #d6dee2; padding: 9px 6px; text-align: left; vertical-align: top; }
th { color: #647480; font-weight: 500; width: 34%; }
td { font-weight: 600; }
.footer { color: #647480; font-size: 10px; margin-top: 36px; }
</style></head><body>
<div class="letterhead"><div class="brand">IV LEAGUE</div><div class="tagline">Clinical Procedure Services</div></div>
<h1>Procedure Completion Record</h1>
<h2>Completion</h2><table>
${row('Date and time', completedAt.toLocaleString())}
${row('Task completed', procedure.task ?? '')}
</table>
<h2>Clinician</h2><table>
${row('Name', profile.name)}
${row('Professional credentials', profile.credentials)}
</table>
<h2>Client</h2><table>
${row('Name', client.name)}
${row('Date of birth', client.dateOfBirth)}
${row('Medical record number', client.medicalRecordNumber)}
${row('Facility', client.facility)}
${row('Room number', client.roomNumber)}
</table>
${details ? `<h2>Procedure details</h2><table>${details}</table>` : ''}
<div class="footer">Generated after clinician review and confirmation in the IV League mobile application.</div>
</body></html>`;
}

let pendingPdfUri: string | null = null;
const REPORT_DIRECTORY = `${FileSystem.cacheDirectory ?? ''}iv-league-reports/`;
const REPORT_MAX_AGE_MS = 60 * 60 * 1000;
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function sanitizeFilenamePart(value: string, fallback: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s-]+$/g, '')
    .trim()
    .slice(0, 60);
  return sanitized || fallback;
}

export function buildAttachmentFilename(record: CompletionRecord): string {
  const facility = sanitizeFilenamePart(record.client.facility, 'Facility');
  const clientName = sanitizeFilenamePart(record.client.name, 'Client');
  const date = record.completedAt.toISOString().slice(0, 10);
  return `${facility}_${clientName}_${date}.pdf`;
}

function attachmentUri(record: CompletionRecord): string {
  if (!FileSystem.cacheDirectory) {
    throw new Error('App cache is unavailable');
  }
  return `${REPORT_DIRECTORY}${buildAttachmentFilename(record)}`;
}

async function retryPendingCleanup(): Promise<void> {
  if (!pendingPdfUri) {
    return;
  }
  await FileSystem.deleteAsync(pendingPdfUri, { idempotent: true });
  const timer = cleanupTimers.get(pendingPdfUri);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(pendingPdfUri);
  }
  pendingPdfUri = null;
}

function scheduleReportCleanup(uri: string): void {
  const existing = cleanupTimers.get(uri);
  if (existing) {
    clearTimeout(existing);
  }
  cleanupTimers.set(uri, setTimeout(() => {
    FileSystem.deleteAsync(uri, { idempotent: true })
      .then(() => {
        cleanupTimers.delete(uri);
        if (pendingPdfUri === uri) {
          pendingPdfUri = null;
        }
      })
      .catch(() => {
        cleanupTimers.delete(uri);
      });
  }, REPORT_MAX_AGE_MS));
}

export async function cleanupStaleSharedReports(now = Date.now()): Promise<void> {
  const directory = await FileSystem.getInfoAsync(REPORT_DIRECTORY);
  if (!directory.exists) {
    return;
  }
  const files = await FileSystem.readDirectoryAsync(REPORT_DIRECTORY);
  await Promise.all(files.map(async (file) => {
    const uri = `${REPORT_DIRECTORY}${file}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.modificationTime && now - info.modificationTime * 1000 >= REPORT_MAX_AGE_MS) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      const timer = cleanupTimers.get(uri);
      if (timer) {
        clearTimeout(timer);
        cleanupTimers.delete(uri);
      }
      if (pendingPdfUri === uri) {
        pendingPdfUri = null;
      }
    }
  }));
}

export async function generateAndShareReport(
  record: CompletionRecord,
  onGenerated?: (report: { uri: string; filename: string }) => Promise<void>,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is unavailable');
  }
  await retryPendingCleanup();
  await cleanupStaleSharedReports();
  await FileSystem.makeDirectoryAsync(REPORT_DIRECTORY, { intermediates: true });
  const printed = await Print.printToFileAsync({ html: buildReportHtml(record) });
  const uri = attachmentUri(record);
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.moveAsync({ from: printed.uri, to: uri });
  } catch (error) {
    await FileSystem.deleteAsync(printed.uri, { idempotent: true });
    throw error;
  }
  pendingPdfUri = uri;
  await onGenerated?.({ uri, filename: buildAttachmentFilename(record) });
  await shareReportUri(uri);
}

async function shareReportUri(uri: string): Promise<void> {
  try {
    const result = await sharePdf(uri, 'Email or share IV League completion record');
    if (!result.ok) {
      throw new Error(result.message);
    }
    scheduleReportCleanup(uri);
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    pendingPdfUri = null;
    throw error;
  }
}

function safeStoredFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
}

export async function shareStoredReport(filename: string, base64: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is unavailable');
  }
  await retryPendingCleanup();
  await cleanupStaleSharedReports();
  await FileSystem.makeDirectoryAsync(REPORT_DIRECTORY, { intermediates: true });
  const safeFilename = safeStoredFilename(filename);
  const uri = `${REPORT_DIRECTORY}${safeFilename}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  pendingPdfUri = uri;
  await shareReportUri(uri);
}

export async function deleteCachedReport(filename: string): Promise<void> {
  const uri = `${REPORT_DIRECTORY}${safeStoredFilename(filename)}`;
  const timer = cleanupTimers.get(uri);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(uri);
  }
  await FileSystem.deleteAsync(uri, { idempotent: true });
  if (pendingPdfUri === uri) {
    pendingPdfUri = null;
  }
}
