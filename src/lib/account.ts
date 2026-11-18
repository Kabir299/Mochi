import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync } from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { randomToken, SyncError } from '@/lib/buddySync';
import { secureGet, secureSet } from '@/lib/secureStorage';

// Optional sign-in with Google, through Supabase. Signing in is only for keeping the same data
// on every device; the app works fully without it.
const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const API_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const TIMEOUT_MS = 15_000;

const SESSION_KEY = 'mochi-account';
const VERIFIER_KEY = 'mochi-signin-verifier';

export const accountAvailable = !!URL_BASE && !!API_KEY;

export type Session = {
  accessToken: string;
  refreshToken: string;
  // When the access token stops working, in milliseconds.
  expiresAt: number;
  userId: string;
  email: string;
  name: string;
};

async function remove(key: string) {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function auth(path: string, body: Record<string, string>, token?: string) {
  if (!URL_BASE || !API_KEY) throw new SyncError('offline');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${URL_BASE}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: API_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new SyncError('offline');
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return response.status === 204 ? null : response.json().catch(() => null);
  // 4xx means the sign-in itself was refused; anything else, the server couldn't be reached.
  throw new SyncError(response.status >= 400 && response.status < 500 ? 'signed_out' : 'offline');
}

function toSession(raw: unknown): Session {
  const r = raw as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string; email?: string; user_metadata?: { full_name?: string; name?: string } };
  } | null;
  if (!r?.access_token || !r.refresh_token || !r.user?.id) throw new SyncError('signed_out');
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
    userId: r.user.id,
    email: r.user.email ?? '',
    name: r.user.user_metadata?.full_name ?? r.user.user_metadata?.name ?? '',
  };
}

export async function loadSession(): Promise<Session | null> {
  try {
    const saved = await secureGet(SESSION_KEY);
    const session = saved ? (JSON.parse(saved) as Session) : null;
    // The short-lived pass isn't kept, so the first use after opening the app fetches one.
    return session?.refreshToken && session.userId
      ? { ...session, accessToken: '', expiresAt: 0 }
      : null;
  } catch {
    return null;
  }
}

export const saveSession = ({ refreshToken, userId, email, name }: Session) =>
  secureSet(SESSION_KEY, JSON.stringify({ refreshToken, userId, email, name }));
export const clearSession = () => remove(SESSION_KEY);

// Where Google sends the person back to: the "auth" screen of this app.
const redirectUrl = () =>
  Platform.OS === 'web' ? `${window.location.origin}/auth` : Linking.createURL('auth');

// Opens Google's sign-in page. On phones this resolves with the one-time code (or null if they
// closed the page); on the web the whole page leaves and comes back to the auth screen.
export async function startGoogleSignIn(): Promise<string | null> {
  if (!URL_BASE) throw new SyncError('offline');
  // Proves the code that comes back was asked for by this device (PKCE).
  const verifier = (await randomToken()) + (await randomToken());
  const challenge = (
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: CryptoEncoding.BASE64,
    })
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  await secureSet(VERIFIER_KEY, verifier);

  const redirect = redirectUrl();
  const url =
    `${URL_BASE}/auth/v1/authorize?provider=google` +
    `&redirect_to=${encodeURIComponent(redirect)}` +
    `&code_challenge=${challenge}&code_challenge_method=s256`;

  if (Platform.OS === 'web') {
    window.location.assign(url);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, redirect);
  return result.type === 'success' ? codeFrom(result.url) : null;
}

// The one-time code in the address Google sent the person back to.
export function codeFrom(url: string) {
  return /[?&#]code=([^&#]+)/.exec(url)?.[1] ?? null;
}

// Swaps the one-time code for a session.
export async function finishSignIn(code: string) {
  const verifier = await secureGet(VERIFIER_KEY);
  if (!verifier) throw new SyncError('signed_out');
  const session = toSession(
    await auth('token?grant_type=pkce', { auth_code: code, code_verifier: verifier }),
  );
  await remove(VERIFIER_KEY);
  await saveSession(session);
  return session;
}

// Access tokens last about an hour; this gets a new one. Throws 'signed_out' when the account
// was removed or signed out everywhere.
export async function refreshSession(session: Session) {
  const next = toSession(
    await auth('token?grant_type=refresh_token', { refresh_token: session.refreshToken }),
  );
  await saveSession(next);
  return next;
}

export async function signOut(session: Session | null) {
  // Best effort: the session is forgotten here even if the server can't be told.
  if (session) await auth('logout?scope=local', {}, session.accessToken).catch(() => {});
  await clearSession();
}

// What this device last agreed with the server on, kept per account.
export type SyncMark = {
  userId: string;
  // The server's version this device's data is based on. 0 before the first sync.
  version: number;
  // Fingerprint of the data at that version, to tell whether anything changed here since.
  hash: string;
  // When a change was first noticed here that hasn't been saved to the account yet.
  dirtySince: number | null;
  // Check-ins in the data at that version, to notice a sync that would lose many of them.
  ticks?: number;
};

// Kept in the same database as the data it describes. It used to live apart from it, so a
// device whose data had been reset still thought it was in step, took the empty data for a
// deliberate change and saved it over the account, emptying every other device too. Now the
// mark goes wherever the data goes, and a reset device starts again like a new one.
const MARK_ROW = 'syncMark';
const LEGACY_MARK_KEY = 'mochi-sync-mark';

export async function loadMark(db: SQLiteDatabase, userId: string): Promise<SyncMark> {
  // The old copy outside the database can't be trusted; it's dropped.
  remove(LEGACY_MARK_KEY).catch(() => {});
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_state WHERE key = ?',
      [MARK_ROW],
    );
    const mark = row ? (JSON.parse(row.value) as SyncMark) : null;
    if (mark?.userId === userId) return mark;
  } catch {}
  return { userId, version: 0, hash: '', dirtySince: null };
}

export const saveMark = (db: SQLiteDatabase, mark: SyncMark) =>
  db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', [
    MARK_ROW,
    JSON.stringify(mark),
  ]);

export const clearMark = (db: SQLiteDatabase) =>
  db.runAsync('DELETE FROM sync_state WHERE key = ?', [MARK_ROW]);
