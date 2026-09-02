import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { needsProcedureDetails } from '../domain/workflow';
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

function attachmentUri(completedAt: Date): string {
  if (!FileSystem.cacheDirectory) {
    throw new Error('App cache is unavailable');
  }
  const date = completedAt.toISOString().slice(0, 10);
  return `${FileSystem.cacheDirectory}IV-League-Completion-${date}.pdf`;
}

async function retryPendingCleanup(): Promise<void> {
  if (!pendingPdfUri) {
    return;
  }
  await FileSystem.deleteAsync(pendingPdfUri, { idempotent: true });
  pendingPdfUri = null;
}

export async function generateAndShareReport(record: CompletionRecord): Promise<{ cleanedUp: boolean }> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is unavailable');
  }
  await retryPendingCleanup();
  const printed = await Print.printToFileAsync({ html: buildReportHtml(record) });
  const uri = attachmentUri(record.completedAt);
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.moveAsync({ from: printed.uri, to: uri });
  } catch (error) {
    await FileSystem.deleteAsync(printed.uri, { idempotent: true });
    throw error;
  }
  pendingPdfUri = uri;
  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Email or share IV League completion record',
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    pendingPdfUri = null;
    throw error;
  }
  try {
    await retryPendingCleanup();
    return { cleanedUp: true };
  } catch {
    return { cleanedUp: false };
  }
}
