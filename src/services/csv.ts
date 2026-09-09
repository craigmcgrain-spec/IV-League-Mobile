import * as FileSystem from 'expo-file-system/legacy';

import { shareFile } from '../native/sharing';
import type { CompletedProcedure, UserProfile } from '../types';

const EXPORT_DIRECTORY = `${FileSystem.cacheDirectory ?? ''}iv-league-exports/`;
const EXPORT_MAX_AGE_MS = 60 * 60 * 1000;
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function csvCell(value: string): string {
  const flattened = value.replace(/\r?\n/g, ' ').trim();
  const spreadsheetSafe = /^[=+\-@]/.test(flattened) ? `'${flattened}` : flattened;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export function buildCompletedProceduresCsv(
  profile: UserProfile,
  records: CompletedProcedure[],
): string {
  if (records.length === 0) {
    throw new Error('Select at least one completed procedure');
  }
  const header = [
    'Completed At (ISO 8601)',
    'Task',
    'Clinician Name',
    'Clinician Credentials',
    'Client Name',
    'Facility',
    'Room Number',
    'Procedure Details',
  ];
  const rows = [...records]
    .sort((left, right) => (
      new Date(left.completedAt).getTime() - new Date(right.completedAt).getTime()
    ))
    .map((record) => [
      record.completedAt,
      record.task,
      profile.name,
      profile.credentials,
      record.clientName,
      record.facility,
      record.roomNumber,
      record.details,
    ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function buildCompletedProceduresCsvFilename(records: CompletedProcedure[]): string {
  if (records.length === 0) {
    throw new Error('Select at least one completed procedure');
  }
  const dates = records.map((record) => record.completedAt.slice(0, 10)).sort();
  return `Completed Procedures Data_${dates[0]}_to_${dates[dates.length - 1]}.csv`;
}

function scheduleCleanup(uri: string): void {
  const existing = cleanupTimers.get(uri);
  if (existing) {
    clearTimeout(existing);
  }
  cleanupTimers.set(uri, setTimeout(() => {
    FileSystem.deleteAsync(uri, { idempotent: true }).finally(() => {
      cleanupTimers.delete(uri);
    });
  }, EXPORT_MAX_AGE_MS));
}

export async function cleanupStaleCsvExports(now = Date.now()): Promise<void> {
  const directory = await FileSystem.getInfoAsync(EXPORT_DIRECTORY);
  if (!directory.exists) {
    return;
  }
  const files = await FileSystem.readDirectoryAsync(EXPORT_DIRECTORY);
  await Promise.all(files.map(async (file) => {
    const uri = `${EXPORT_DIRECTORY}${file}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (
      info.exists
      && info.modificationTime
      && now - info.modificationTime * 1000 >= EXPORT_MAX_AGE_MS
    ) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  }));
}

export async function generateAndShareCompletedProceduresCsv(
  profile: UserProfile,
  records: CompletedProcedure[],
): Promise<void> {
  await cleanupStaleCsvExports();
  await FileSystem.makeDirectoryAsync(EXPORT_DIRECTORY, { intermediates: true });
  const uri = `${EXPORT_DIRECTORY}${buildCompletedProceduresCsvFilename(records)}`;
  await FileSystem.writeAsStringAsync(uri, buildCompletedProceduresCsv(profile, records), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    const result = await shareFile(uri, {
      dialogTitle: 'Send selected procedure data',
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    scheduleCleanup(uri);
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw error;
  }
}
