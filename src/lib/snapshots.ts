import type { SQLiteDatabase } from 'expo-sqlite';

import { toDateKey } from '@/lib/dates';
import { Backup, deleteAllData, exportAll, parseBackup, restoreAll } from '@/lib/db';

// Copies of everything, kept inside the app's own database so a wrong sync or restore
// can always be undone. One is made each day the app is opened, and one right before
// anything replaces the data.

export type SnapshotReason = 'daily' | 'before_sync' | 'before_restore';

export type SnapshotInfo = {
  id: number;
  madeAt: string;
  reason: SnapshotReason;
  habits: number;
  ticks: number;
};

const KEEP_DAILY = 7;
const KEEP_OTHER = 10;

// Tables only this device uses: never exported, backed up or synced. Not part of the
// versioned schema, so backups and synced copies stay readable by older versions.
export async function ensureLocalTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      made_at TEXT NOT NULL,
      day TEXT NOT NULL,
      reason TEXT NOT NULL,
      habits INTEGER NOT NULL,
      ticks INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);
}

export async function saveSnapshot(db: SQLiteDatabase, reason: SnapshotReason) {
  const backup = await exportAll(db);
  // Nothing worth keeping yet.
  if (backup.habits.length === 0 && backup.logs.length === 0) return;
  const now = new Date();
  await db.runAsync(
    'INSERT INTO snapshots (made_at, day, reason, habits, ticks, data) VALUES (?, ?, ?, ?, ?, ?)',
    [
      now.toISOString(),
      toDateKey(now),
      reason,
      backup.habits.length,
      backup.logs.length,
      JSON.stringify(backup),
    ],
  );
  await prune(db);
}

async function prune(db: SQLiteDatabase) {
  await db.runAsync(
    `DELETE FROM snapshots WHERE reason = 'daily' AND id NOT IN
      (SELECT id FROM snapshots WHERE reason = 'daily' ORDER BY id DESC LIMIT ?)`,
    [KEEP_DAILY],
  );
  await db.runAsync(
    `DELETE FROM snapshots WHERE reason != 'daily' AND id NOT IN
      (SELECT id FROM snapshots WHERE reason != 'daily' ORDER BY id DESC LIMIT ?)`,
    [KEEP_OTHER],
  );
}

// Once per day, the first time the app opens.
export async function saveDailySnapshot(db: SQLiteDatabase) {
  const today = toDateKey(new Date());
  const done = await db.getFirstAsync(
    "SELECT id FROM snapshots WHERE reason = 'daily' AND day = ?",
    [today],
  );
  if (!done) await saveSnapshot(db, 'daily');
}

export function listSnapshots(db: SQLiteDatabase) {
  return db
    .getAllAsync<{
      id: number;
      made_at: string;
      reason: SnapshotReason;
      habits: number;
      ticks: number;
    }>('SELECT id, made_at, reason, habits, ticks FROM snapshots ORDER BY made_at DESC')
    .then((rows) =>
      rows.map<SnapshotInfo>((r) => ({
        id: r.id,
        madeAt: r.made_at,
        reason: r.reason,
        habits: r.habits,
        ticks: r.ticks,
      })),
    );
}

export async function loadSnapshot(db: SQLiteDatabase, id: number): Promise<Backup> {
  const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM snapshots WHERE id = ?', [
    id,
  ]);
  if (!row) throw new Error('That copy is no longer kept.');
  return parseBackup(row.data);
}

// Every path that replaces or wipes the data goes through here, so the old data is kept.
export async function replaceAll(db: SQLiteDatabase, backup: Backup, reason: SnapshotReason) {
  await saveSnapshot(db, reason);
  await restoreAll(db, backup);
}

// "Delete all data" means gone, so the kept copies go too.
export async function wipeAll(db: SQLiteDatabase) {
  await deleteAllData(db);
  await db.runAsync('DELETE FROM snapshots');
}
