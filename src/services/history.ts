import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { bytesToHex } from '@noble/hashes/utils.js';

import { completionSummary } from '../domain/history';
import type { CompletedProcedure, CompletionRecord, ProcedureTask } from '../types';

const DATABASE_NAME = 'iv-league-history.db';
const DATABASE_KEY = 'iv-league.history-key.v1';
export const HISTORY_PAGE_SIZE = 25;

interface CompletedProcedureRow {
  id: number;
  completed_at: string;
  task: string;
  client_name: string;
  facility: string;
  details: string;
  pdf_filename: string | null;
  has_pdf: number;
}

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function loadOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY);
  if (existing) {
    return existing;
  }
  const key = bytesToHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(DATABASE_KEY, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

async function openHistoryDatabase(): Promise<SQLite.SQLiteDatabase> {
  const key = await loadOrCreateDatabaseKey();
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`PRAGMA key = "x'${key}'";`);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS completed_procedures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      completed_at TEXT NOT NULL,
      task TEXT NOT NULL,
      client_name TEXT NOT NULL,
      facility TEXT NOT NULL,
      details TEXT NOT NULL,
      pdf_filename TEXT,
      pdf_base64 TEXT
    );
    CREATE INDEX IF NOT EXISTS completed_procedures_completed_at
      ON completed_procedures(completed_at DESC);
  `);
  const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(completed_procedures)');
  if (!columns.some((column) => column.name === 'pdf_filename')) {
    await database.execAsync('ALTER TABLE completed_procedures ADD COLUMN pdf_filename TEXT;');
  }
  if (!columns.some((column) => column.name === 'pdf_base64')) {
    await database.execAsync('ALTER TABLE completed_procedures ADD COLUMN pdf_base64 TEXT;');
  }
  return database;
}

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openHistoryDatabase().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function mapRow(row: CompletedProcedureRow): CompletedProcedure {
  return {
    id: row.id,
    completedAt: row.completed_at,
    task: row.task as ProcedureTask,
    clientName: row.client_name,
    facility: row.facility,
    details: row.details,
    hasPdf: row.has_pdf === 1,
    pdfFilename: row.pdf_filename,
  };
}

export async function listCompletedProcedures(offset = 0): Promise<{ records: CompletedProcedure[]; hasMore: boolean }> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CompletedProcedureRow>(`
    SELECT id, completed_at, task, client_name, facility, details, pdf_filename,
      CASE WHEN pdf_base64 IS NOT NULL THEN 1 ELSE 0 END AS has_pdf
    FROM completed_procedures
    ORDER BY completed_at DESC
    LIMIT ? OFFSET ?
  `, HISTORY_PAGE_SIZE + 1, offset);
  return {
    records: rows.slice(0, HISTORY_PAGE_SIZE).map(mapRow),
    hasMore: rows.length > HISTORY_PAGE_SIZE,
  };
}

export async function saveCompletedProcedure(
  record: CompletionRecord,
  pdfUri: string,
  pdfFilename: string,
): Promise<CompletedProcedure> {
  const summary = completionSummary(record);
  const pdfBase64 = await FileSystem.readAsStringAsync(pdfUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO completed_procedures
      (completed_at, task, client_name, facility, details, pdf_filename, pdf_base64)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    summary.completedAt,
    summary.task,
    summary.clientName,
    summary.facility,
    summary.details,
    pdfFilename,
    pdfBase64,
  );
  return {
    id: result.lastInsertRowId,
    ...summary,
    hasPdf: true,
    pdfFilename,
  };
}

export async function loadCompletedProcedurePdf(id: number): Promise<{ filename: string; base64: string }> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ pdf_filename: string | null; pdf_base64: string | null }>(
    'SELECT pdf_filename, pdf_base64 FROM completed_procedures WHERE id = ?',
    id,
  );
  if (!row?.pdf_filename || !row.pdf_base64) {
    throw new Error('Stored PDF is unavailable');
  }
  return { filename: row.pdf_filename, base64: row.pdf_base64 };
}

export async function deleteCompletedProcedure(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM completed_procedures WHERE id = ?', id);
  await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}
