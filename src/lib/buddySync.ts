import {
  AESEncryptionKey,
  aesDecryptAsync,
  aesEncryptAsync,
  AESSealedData,
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomBytesAsync,
} from 'expo-crypto';

import { BuddySnapshot, cleanSnapshot } from '@/lib/buddies';
import { BuddyLink } from '@/lib/buddyLinks';

// The link between friends' phones. The publishable key is meant to ship inside apps: it can only
// call the functions in supabase/schema.sql. Progress is encrypted here before it leaves the phone.
const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
const API_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const TIMEOUT_MS = 10_000;

export const syncAvailable = !!URL_BASE && !!API_KEY;

// `code` is what the server said went wrong, or 'offline' when it couldn't be reached.
export class SyncError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function syncErrorMessage(e: unknown) {
  switch (e instanceof SyncError ? e.code : '') {
    case 'offline':
      return 'Can’t reach Mochi’s server. Check your connection and try again.';
    case 'invite_invalid':
      return 'That invite has already been used or has run out. Ask for a new one.';
    case 'own_invite':
      return 'That’s your own invite. Send it to your friend instead.';
    case 'already_linked':
      return 'You’re already buddies.';
    case 'too_many':
      return 'You’ve reached the limit of 50 buddies and invites.';
    case 'busy':
      return 'Lots of people are joining right now. Try again in a minute.';
    default:
      return 'Something went wrong. Try again.';
  }
}

export async function rpc<T = void>(name: string, args: Record<string, string>): Promise<T> {
  if (!URL_BASE || !API_KEY) throw new SyncError('offline');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify(args),
      signal: controller.signal,
    });
  } catch {
    throw new SyncError('offline');
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A paused or broken server can answer with a web page.
  }
  if (!response.ok) {
    const message = (body as { message?: unknown } | null)?.message;
    // Anything that isn't one of ours, like a paused project, counts as not reachable.
    throw new SyncError(typeof message === 'string' && /^[a-z_]+$/.test(message) ? message : 'offline');
  }
  return body as T;
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// 32 random bytes, as 43 characters. Used for a phone's secret and for each invite.
export async function randomToken() {
  return base64Url(await getRandomBytesAsync(32));
}

// An invite gives both phones the same link id and key. The server only ever sees the id, and
// can't work the key out from it.
export async function deriveLink(token: string) {
  const hash = (label: string) =>
    digestStringAsync(CryptoDigestAlgorithm.SHA256, `mochi-${label}:${token}`);
  return { id: await hash('link-id'), key: await hash('link-key') };
}

// Names in any language go through URI escapes, since not every phone has TextDecoder.
function toBytes(text: string) {
  const binary = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function fromBytes(bytes: Uint8Array) {
  return decodeURIComponent(
    Array.from(bytes, (b) => '%' + b.toString(16).padStart(2, '0')).join(''),
  );
}

// Ties an update to its link and sender, so the server can't pass one off as coming from somebody
// else, or show you your own progress as your friend's.
const label = (link: BuddyLink, sender: BuddyLink['role']) => toBytes(`${link.id}:${sender}`);

export async function sealSnapshot(link: BuddyLink, json: string) {
  const key = await AESEncryptionKey.import(link.key, 'hex');
  const sealed = await aesEncryptAsync(toBytes(json), key, {
    additionalData: label(link, link.role),
  });
  return sealed.combined('base64');
}

// Null when it can't be opened or isn't valid: the friend keeps showing their last good update.
export async function openSnapshot(link: BuddyLink, payload: string): Promise<BuddySnapshot | null> {
  try {
    const key = await AESEncryptionKey.import(link.key, 'hex');
    const plain = await aesDecryptAsync(AESSealedData.fromCombined(payload), key, {
      additionalData: label(link, link.role === 'inviter' ? 'joiner' : 'inviter'),
    });
    return cleanSnapshot(JSON.parse(fromBytes(plain)));
  } catch {
    return null;
  }
}
