import type { SQLiteDatabase } from 'expo-sqlite';

import type { DateKey } from '@/lib/dates';

export const DATABASE_NAME = 'habits.db';

export type Repeat = 'daily' | 'days' | 'once';

export type HabitRecord = {
  id: number;
  name: string;
  icon: string;
  // 1 for a yes/no habit; more for counted habits like "8 glasses".
  target: number;
  unit: string | null;
  repeat: Repeat;
  // How much the habit counts toward the daily %: 1 low, 2 medium, 3 high.
  weight: number;
  // Minutes after midnight the habit is planned for; null means any time.
  start_minute: number | null;
  // Planned length in minutes; null when untimed.
  duration_min: number | null;
  // Comma-separated weekdays (0 = Sunday) when repeat is 'days'.
  days: string | null;
  // The one day a 'once' task is due.
  once_day: DateKey | null;
  // Hidden from Today and stats but kept with its history.
  archived: number;
  // Position in the "any time" list; lower comes first.
  sort_order: number;
  // Local day the habit starts counting; null means the day it was created.
  start_day: DateKey | null;
  // Comma-separated weekdays (0 = Sunday) that are days off: skipping them doesn't break the
  // habit's streak. Null when there are none.
  rest_days: string | null;
  // SQLite UTC timestamp, "YYYY-MM-DD HH:MM:SS".
  created_at: string;
};

export type HabitInput = Omit<HabitRecord, 'id' | 'created_at' | 'archived' | 'sort_order'>;

export type LogRecord = {
  habit_id: number;
  day: DateKey;
  count: number;
  note: string | null;
  // 1 (low) to 5 (great), or null.
  mood: number | null;
  // Minutes tracked with the focus timer.
  spent_min: number | null;
};

export type WaterLog = {
  id: number;
  day: DateKey;
  ml: number;
};

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type FoodLog = {
  id: number;
  day: DateKey;
  meal: Meal;
  name: string;
  calories: number;
  protein: number;
};

export type FoodInput = Omit<FoodLog, 'id'>;

export type GymLog = {
  id: number;
  day: DateKey;
  minutes: number;
};

const DATABASE_VERSION = 10;

// Runs before the app renders. Each schema change gets its own
// `if (version === N)` step so existing installs upgrade in place.
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE habits (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        target INTEGER NOT NULL DEFAULT 1,
        unit TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE logs (
        habit_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (habit_id, day)
      );
    `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE water_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        day TEXT NOT NULL,
        ml INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX water_logs_day ON water_logs (day);
      CREATE TABLE food_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        day TEXT NOT NULL,
        meal TEXT NOT NULL,
        name TEXT NOT NULL,
        calories INTEGER NOT NULL DEFAULT 0,
        protein INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX food_logs_day ON food_logs (day);
    `);
    version = 2;
  }

  if (version === 2) {
    await db.execAsync(`
      ALTER TABLE habits ADD COLUMN repeat TEXT NOT NULL DEFAULT 'daily';
      ALTER TABLE habits ADD COLUMN days TEXT;
      ALTER TABLE habits ADD COLUMN once_day TEXT;
    `);
    version = 3;
  }

  if (version === 3) {
    await db.execAsync(`ALTER TABLE habits ADD COLUMN weight INTEGER NOT NULL DEFAULT 2;`);
    version = 4;
  }

  if (version === 4) {
    await db.execAsync(`
      ALTER TABLE habits ADD COLUMN start_minute INTEGER;
      ALTER TABLE habits ADD COLUMN duration_min INTEGER;
    `);
    version = 5;
  }

  if (version === 5) {
    await db.execAsync(`ALTER TABLE habits ADD COLUMN start_day TEXT;`);
    version = 6;
  }

  if (version === 6) {
    await db.execAsync(`
      ALTER TABLE habits ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE habits ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE logs ADD COLUMN note TEXT;
      ALTER TABLE logs ADD COLUMN mood INTEGER;
      ALTER TABLE logs ADD COLUMN spent_min INTEGER;
      UPDATE habits SET sort_order = id;
    `);
    version = 7;
  }

  if (version === 7) {
    // Version 8 briefly added a day recap table; the feature was removed. Installs that
    // got it drop it here, the rest just move on, so later versions stay in step.
    await db.execAsync('DROP TABLE IF EXISTS day_logs;');
    version = 8;
  }

  if (version === 8) {
    await db.execAsync(`
      CREATE TABLE gym_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        day TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX gym_logs_day ON gym_logs (day);
    `);
    version = 9;
  }

  if (version === 9) {
    await db.execAsync(`ALTER TABLE habits ADD COLUMN rest_days TEXT;`);
    version = 10;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export function getHabits(db: SQLiteDatabase) {
  return db.getAllAsync<HabitRecord>(
    'SELECT id, name, icon, target, unit, repeat, weight, start_minute, duration_min, days, once_day, start_day, rest_days, archived, sort_order, created_at FROM habits ORDER BY sort_order, id',
  );
}

export function getLogs(db: SQLiteDatabase) {
  return db.getAllAsync<LogRecord>('SELECT habit_id, day, count, note, mood, spent_min FROM logs');
}

export async function insertHabit(db: SQLiteDatabase, input: HabitInput) {
  const result = await db.runAsync(
    'INSERT INTO habits (sort_order, name, icon, target, unit, repeat, weight, start_minute, duration_min, days, once_day, start_day, rest_days) VALUES ((SELECT COALESCE(MAX(sort_order), 0) + 1 FROM habits), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    input.name,
    input.icon,
    input.target,
    input.unit,
    input.repeat,
    input.weight,
    input.start_minute,
    input.duration_min,
    input.days,
    input.once_day,
    input.start_day,
    input.rest_days,
  );
  return result.lastInsertRowId;
}

export async function updateHabit(db: SQLiteDatabase, id: number, input: HabitInput) {
  await db.runAsync(
    'UPDATE habits SET name = ?, icon = ?, target = ?, unit = ?, repeat = ?, weight = ?, start_minute = ?, duration_min = ?, days = ?, once_day = ?, start_day = ?, rest_days = ? WHERE id = ?',
    input.name,
    input.icon,
    input.target,
    input.unit,
    input.repeat,
    input.weight,
    input.start_minute,
    input.duration_min,
    input.days,
    input.once_day,
    input.start_day,
    input.rest_days,
    id,
  );
}

export async function deleteHabit(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM logs WHERE habit_id = ?', id);
    await db.runAsync('DELETE FROM habits WHERE id = ?', id);
  });
}

export async function setLogCount(
  db: SQLiteDatabase,
  habitId: number,
  day: DateKey,
  count: number,
) {
  await db.runAsync(
    `INSERT INTO logs (habit_id, day, count) VALUES (?, ?, ?)
     ON CONFLICT (habit_id, day) DO UPDATE SET count = excluded.count`,
    habitId,
    day,
    count,
  );
}

export async function getSettings(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export function getWaterLogs(db: SQLiteDatabase, fromDay: DateKey) {
  return db.getAllAsync<WaterLog>(
    'SELECT id, day, ml FROM water_logs WHERE day >= ? ORDER BY id',
    fromDay,
  );
}

export async function insertWater(db: SQLiteDatabase, day: DateKey, ml: number) {
  const result = await db.runAsync('INSERT INTO water_logs (day, ml) VALUES (?, ?)', day, ml);
  return result.lastInsertRowId;
}

export async function deleteWater(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM water_logs WHERE id = ?', id);
}

export function getFoodLogs(db: SQLiteDatabase, fromDay: DateKey) {
  return db.getAllAsync<FoodLog>(
    'SELECT id, day, meal, name, calories, protein FROM food_logs WHERE day >= ? ORDER BY id',
    fromDay,
  );
}

export async function insertFood(db: SQLiteDatabase, input: FoodInput) {
  const result = await db.runAsync(
    'INSERT INTO food_logs (day, meal, name, calories, protein) VALUES (?, ?, ?, ?, ?)',
    input.day,
    input.meal,
    input.name,
    input.calories,
    input.protein,
  );
  return result.lastInsertRowId;
}

export async function deleteFood(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM food_logs WHERE id = ?', id);
}

export function getGymLogs(db: SQLiteDatabase, fromDay: DateKey) {
  return db.getAllAsync<GymLog>(
    'SELECT id, day, minutes FROM gym_logs WHERE day >= ? ORDER BY id',
    fromDay,
  );
}

export async function insertGym(db: SQLiteDatabase, day: DateKey, minutes: number) {
  const result = await db.runAsync(
    'INSERT INTO gym_logs (day, minutes) VALUES (?, ?)',
    day,
    minutes,
  );
  return result.lastInsertRowId;
}

export async function deleteGym(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM gym_logs WHERE id = ?', id);
}

export async function setLogNote(
  db: SQLiteDatabase,
  habitId: number,
  day: DateKey,
  note: string | null,
  mood: number | null,
) {
  await db.runAsync(
    `INSERT INTO logs (habit_id, day, count, note, mood) VALUES (?, ?, 0, ?, ?)
     ON CONFLICT (habit_id, day) DO UPDATE SET note = excluded.note, mood = excluded.mood`,
    habitId,
    day,
    note,
    mood,
  );
}

export async function addSpent(db: SQLiteDatabase, habitId: number, day: DateKey, minutes: number) {
  await db.runAsync(
    `INSERT INTO logs (habit_id, day, count, spent_min) VALUES (?, ?, 0, ?)
     ON CONFLICT (habit_id, day) DO UPDATE SET spent_min = COALESCE(spent_min, 0) + excluded.spent_min`,
    habitId,
    day,
    minutes,
  );
}

export async function setArchived(db: SQLiteDatabase, id: number, archived: boolean) {
  await db.runAsync('UPDATE habits SET archived = ? WHERE id = ?', archived ? 1 : 0, id);
}

export async function setOnceDay(db: SQLiteDatabase, id: number, day: DateKey) {
  await db.runAsync('UPDATE habits SET once_day = ? WHERE id = ?', day, id);
}

export async function setSortOrders(db: SQLiteDatabase, ids: number[]) {
  await db.withTransactionAsync(async () => {
    for (const [index, id] of ids.entries()) {
      await db.runAsync('UPDATE habits SET sort_order = ? WHERE id = ?', index, id);
    }
  });
}

type Row = Record<string, string | number | null>;

export type Backup = {
  app: 'mochi';
  version: number;
  exported_at: string;
  habits: Row[];
  logs: Row[];
  water: Row[];
  food: Row[];
  gym: Row[];
  settings: Row[];
};

// Everything the user has entered: the export, and the backup file for a new phone.
export async function exportAll(db: SQLiteDatabase): Promise<Backup> {
  const [habits, logs, water, food, gym, settings] = await Promise.all([
    db.getAllAsync<Row>('SELECT * FROM habits'),
    db.getAllAsync<Row>('SELECT * FROM logs'),
    db.getAllAsync<Row>('SELECT * FROM water_logs'),
    db.getAllAsync<Row>('SELECT * FROM food_logs'),
    db.getAllAsync<Row>('SELECT * FROM gym_logs'),
    db.getAllAsync<Row>('SELECT * FROM settings'),
  ]);
  return {
    app: 'mochi',
    version: DATABASE_VERSION,
    exported_at: new Date().toISOString(),
    habits,
    logs,
    water,
    food,
    gym,
    settings,
  };
}

const BACKUP_TABLES = [
  ['habits', 'habits'],
  ['logs', 'logs'],
  ['water', 'water_logs'],
  ['food', 'food_logs'],
  ['gym', 'gym_logs'],
  ['settings', 'settings'],
] as const;

// Belong to this phone, not the person: Pro comes from the store account, the lock
// and reminders need this phone's own permission.
const DEVICE_SETTINGS = new Set(['isPro', 'appLock', 'remindersOn', 'widgetNames']);

const isRow = (row: unknown): row is Row =>
  typeof row === 'object' &&
  row !== null &&
  !Array.isArray(row) &&
  Object.values(row).every((v) => v === null || typeof v === 'string' || typeof v === 'number');

// Checks a backup file before anything on the phone is touched. Throws a message
// fit to show the person when it isn't one.
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a Mochi backup.');
  }
  const d = data as Partial<Backup> | null;
  if (!d || !Array.isArray(d.habits) || !Array.isArray(d.logs)) {
    throw new Error('That file isn’t a Mochi backup.');
  }
  if (typeof d.version === 'number' && d.version > DATABASE_VERSION) {
    throw new Error('This backup is from a newer version of Mochi. Update the app and try again.');
  }
  const backup = {
    app: 'mochi' as const,
    version: typeof d.version === 'number' ? d.version : 0,
    exported_at: typeof d.exported_at === 'string' ? d.exported_at : '',
    habits: d.habits,
    logs: d.logs,
    water: d.water ?? [],
    food: d.food ?? [],
    gym: d.gym ?? [],
    settings: d.settings ?? [],
  };
  for (const [key] of BACKUP_TABLES) {
    if (!Array.isArray(backup[key]) || !backup[key].every(isRow)) {
      throw new Error('This backup file is damaged.');
    }
  }
  return backup;
}

// The same data as a backup, written so two devices holding the same data produce the very same
// text: no timestamp, nothing that belongs to one device, and rows in a fixed order. Account
// sync compares and sends this.
export async function syncSnapshot(db: SQLiteDatabase) {
  const all = await exportAll(db);
  const by = (...keys: string[]) => (a: Row, b: Row) => {
    for (const key of keys) {
      const x = a[key] ?? '';
      const y = b[key] ?? '';
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
  return JSON.stringify({
    app: all.app,
    version: all.version,
    habits: all.habits.sort(by('id')),
    logs: all.logs.sort(by('habit_id', 'day')),
    water: all.water.sort(by('id')),
    food: all.food.sort(by('id')),
    gym: all.gym.sort(by('id')),
    settings: all.settings.filter((row) => !DEVICE_SETTINGS.has(String(row.key))).sort(by('key')),
  });
}

// Replaces everything on this phone with the backup, all or nothing. Columns the
// backup doesn't have keep their defaults, so older backups restore too.
export async function restoreAll(db: SQLiteDatabase, backup: Backup) {
  await db.withTransactionAsync(async () => {
    for (const [key, table] of BACKUP_TABLES) {
      const columns = new Set(
        (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name),
      );
      if (table === 'settings') {
        await db.runAsync(
          `DELETE FROM settings WHERE key NOT IN (${[...DEVICE_SETTINGS].map(() => '?').join(', ')})`,
          [...DEVICE_SETTINGS],
        );
      } else {
        await db.runAsync(`DELETE FROM ${table}`);
      }
      for (const row of backup[key]) {
        if (table === 'settings' && DEVICE_SETTINGS.has(String(row.key))) continue;
        const names = Object.keys(row).filter((name) => columns.has(name));
        if (names.length === 0) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
          names.map((name) => row[name]),
        );
      }
    }
  });
}

// Wipes all data. The starter set is not re-added.
export async function deleteAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM logs');
    await db.runAsync('DELETE FROM habits');
    await db.runAsync('DELETE FROM water_logs');
    await db.runAsync('DELETE FROM food_logs');
    await db.runAsync('DELETE FROM gym_logs');
    await db.runAsync("DELETE FROM settings WHERE key != 'starterSeeded'");
  });
}
