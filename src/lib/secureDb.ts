import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  defaultDatabaseDirectory,
  deleteDatabaseAsync,
  openDatabaseAsync,
  SQLiteDatabase,
} from 'expo-sqlite';
import { Platform } from 'react-native';

import { DATABASE_NAME } from '@/lib/db';

// Phone builds encrypt the database with SQLCipher. The 256-bit key is random per install
// and kept in the iOS Keychain / Android Keystore, never in the app or in the database.
// Expo Go and web have no SQLCipher, so they keep the plain database.
const ENCRYPTED_NAME = 'habits-secure.db';
const KEY_ID = 'mochi-db-key-v1';

export type DbChoice = { name: string; key: string | null };

const keyPragma = (key: string) => `PRAGMA key = "x'${key}'"`;

export async function applyKey(db: SQLiteDatabase, key: string | null) {
  if (key) await db.execAsync(keyPragma(key));
}

async function cipherAvailable() {
  const probe = await openDatabaseAsync(':memory:');
  try {
    // Only SQLCipher answers this; plain SQLite returns nothing.
    return (await probe.getFirstAsync('PRAGMA cipher_version')) !== null;
  } finally {
    await probe.closeAsync();
  }
}

async function getOrCreateKey() {
  const existing = await SecureStore.getItemAsync(KEY_ID);
  if (existing) return existing;
  const bytes = Crypto.getRandomBytes(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_ID, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return key;
}

const tableCount = async (db: SQLiteDatabase) =>
  (await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM sqlite_master'))?.n ?? 0;

// Opens the encrypted file to check the key fits. If it doesn't (say, the key was lost
// when the phone was restored from a backup), the file can never be read, so start fresh.
async function encryptedHasData(key: string) {
  const db = await openDatabaseAsync(ENCRYPTED_NAME);
  try {
    await applyKey(db, key);
    return (await tableCount(db)) > 0;
  } catch {
    await db.closeAsync();
    await deleteDatabaseAsync(ENCRYPTED_NAME);
    return false;
  } finally {
    await db.closeAsync().catch(() => {});
  }
}

// One-time move of the old unencrypted database into the encrypted one.
async function encryptOldDatabase(key: string) {
  const old = await openDatabaseAsync(DATABASE_NAME);
  try {
    if ((await tableCount(old)) > 0 && !(await encryptedHasData(key))) {
      const dir = String(defaultDatabaseDirectory).replace(/^file:\/\//, '');
      const version =
        (await old.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))
          ?.user_version ?? 0;
      await old.execAsync(
        `ATTACH DATABASE '${dir}/${ENCRYPTED_NAME}' AS secure KEY "x'${key}'";
         SELECT sqlcipher_export('secure');
         PRAGMA secure.user_version = ${Number(version)};
         DETACH DATABASE secure;`,
      );
    }
  } finally {
    await old.closeAsync();
  }
  // Only reached when the copy succeeded, was already done or there was nothing to copy.
  await deleteDatabaseAsync(DATABASE_NAME);
}

export async function prepareDatabase(): Promise<DbChoice> {
  if (Platform.OS === 'web' || !(await cipherAvailable())) {
    return { name: DATABASE_NAME, key: null };
  }
  const key = await getOrCreateKey();
  await encryptOldDatabase(key);
  // Also clears an unreadable file if the key was lost.
  await encryptedHasData(key);
  return { name: ENCRYPTED_NAME, key };
}
