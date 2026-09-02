import * as Crypto from 'expo-crypto';
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
      details TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS completed_procedures_completed_at
      ON completed_procedures(completed_at DESC);
  `);
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
  };
}

export async function listCompletedProcedures(offset = 0): Promise<{ records: CompletedProcedure[]; hasMore: boolean }> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CompletedProcedureRow>(`
    SELECT id, completed_at, task, client_name, facility, details
    FROM completed_procedures
    ORDER BY completed_at DESC
    LIMIT ? OFFSET ?
  `, HISTORY_PAGE_SIZE + 1, offset);
  return {
    records: rows.slice(0, HISTORY_PAGE_SIZE).map(mapRow),
    hasMore: rows.length > HISTORY_PAGE_SIZE,
  };
}

export async function saveCompletedProcedure(record: CompletionRecord): Promise<CompletedProcedure> {
  const summary = completionSummary(record);
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO completed_procedures
      (completed_at, task, client_name, facility, details)
      VALUES (?, ?, ?, ?, ?)`,
    summary.completedAt,
    summary.task,
    summary.clientName,
    summary.facility,
    summary.details,
  );
  return { id: result.lastInsertRowId, ...summary };
}

export async function deleteCompletedProcedure(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM completed_procedures WHERE id = ?', id);
  await database.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}
