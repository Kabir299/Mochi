import { addDays, DateKey, toDateKey } from '@/lib/dates';

// What a friend sees: only what the person chose to send, as a code they pass on themselves.
// No accounts and no server; nothing updates until a new code is shared.
export type BuddySnapshot = {
  name: string;
  day: DateKey;
  streak: number;
  // Last 7 days' progress, oldest first; null when nothing was scheduled.
  week: (number | null)[];
  habits: { name: string; rate: number; streak: number }[];
};

const PREFIX = 'MOCHI1-';
const MAX_CODE_LENGTH = 20_000;
const MAX_HABITS = 50;
const MAX_NAME = 40;

export function encodeSnapshot(snapshot: BuddySnapshot) {
  const json = JSON.stringify(snapshot);
  // btoa only takes single bytes, so names in any language go through URI escapes first.
  const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return PREFIX + btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const clampRate = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const clampCount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100000, Math.max(0, Math.round(value)))
    : 0;
const cleanName = (value: unknown) =>
  typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '';

// Accepts the whole shared message. The code comes from someone else, so every field is checked
// and limited; anything malformed gives null.
export function decodeSnapshot(text: string): BuddySnapshot | null {
  const match = /MOCHI1-([A-Za-z0-9_-]+)/.exec(text);
  if (!match || match[1].length > MAX_CODE_LENGTH) return null;
  try {
    const bytes = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
    const escaped = Array.from(
      bytes,
      (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'),
    ).join('');
    const raw = JSON.parse(decodeURIComponent(escaped));
    const name = cleanName(raw?.name);
    const day = typeof raw?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) ? raw.day : null;
    if (!name || !day || !Array.isArray(raw.week) || !Array.isArray(raw.habits)) return null;
    return {
      name,
      day,
      streak: clampCount(raw.streak),
      week: raw.week.slice(-7).map((v: unknown) => (v === null ? null : clampRate(v))),
      habits: raw.habits
        .slice(0, MAX_HABITS)
        .map((h: { name?: unknown; rate?: unknown; streak?: unknown }) => ({
          name: cleanName(h?.name),
          rate: clampRate(h?.rate),
          streak: clampCount(h?.streak),
        }))
        .filter((h: { name: string }) => h.name !== ''),
    };
  } catch {
    return null;
  }
}

// Saved buddies, kept in settings as JSON. Sending a newer code replaces the old one.
export function parseBuddies(raw: string): BuddySnapshot[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addBuddy(list: BuddySnapshot[], buddy: BuddySnapshot) {
  const same = (b: BuddySnapshot) => b.name.toLowerCase() === buddy.name.toLowerCase();
  return [...list.filter((b) => !same(b)), buddy];
}

export function weekAverage(week: (number | null)[]) {
  const days = week.filter((v): v is number => v !== null);
  return days.length > 0 ? days.reduce((s, v) => s + v, 0) / days.length : null;
}

// Habits you both have, matched by name.
export function commonHabits<T extends { name: string }>(mine: T[], buddy: BuddySnapshot) {
  const key = (name: string) => name.trim().toLowerCase();
  return buddy.habits.flatMap((theirs) => {
    const own = mine.find((h) => key(h.name) === key(theirs.name));
    return own ? [{ mine: own, theirs }] : [];
  });
}

// The AI buddy: a pace-setter worked out on the phone from your own history, so it needs no
// server and nothing extra is stored. It stays a little ahead of your recent average, so it
// rises as you do and always leaves something to beat.
const LEAD = 0.08;
const STARTING_PACE = 0.6;
const WOBBLE = 0.06;
const LOOKBACK = 7;
const MAX_DAYS = 365;

export type AiBuddyDay = { day: DateKey; progress: number };
export type AiBuddy = {
  today: number;
  weekAverage: number;
  streak: number;
  level: number;
  // Share of the way to the next level, 0..1.
  toNextLevel: number;
  days: AiBuddyDay[];
};

// The same day always gives the same small variation.
function wobble(day: DateKey) {
  let hash = 0;
  for (const c of day) hash = (hash * 31 + c.charCodeAt(0)) % 9973;
  return ((hash % 100) / 100 - 0.5) * 2 * WOBBLE;
}

export function aiBuddyProgress(day: Date, dayProgress: (day: DateKey) => number | null) {
  const recent: number[] = [];
  for (let i = 1; i <= LOOKBACK; i++) {
    const value = dayProgress(toDateKey(addDays(day, -i)));
    if (value !== null) recent.push(value);
  }
  const yours =
    recent.length > 0 ? recent.reduce((s, v) => s + v, 0) / recent.length : STARTING_PACE;
  return Math.min(1, Math.max(0.3, yours + LEAD + wobble(toDateKey(day))));
}

export function computeAiBuddy(
  since: DateKey,
  today: Date,
  dayProgress: (day: DateKey) => number | null,
  threshold: number,
): AiBuddy {
  const todayKey = toDateKey(today);
  const days: AiBuddyDay[] = [];
  for (let i = MAX_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const key = toDateKey(date);
    if (key >= since && key <= todayKey) {
      days.push({ day: key, progress: aiBuddyProgress(date, dayProgress) });
    }
  }
  if (days.length === 0) days.push({ day: todayKey, progress: aiBuddyProgress(today, dayProgress) });

  let streak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].progress >= threshold; i--) streak++;

  // Levels get further apart: each takes a few more good days than the last.
  let left = days.reduce((s, d) => s + d.progress, 0);
  let level = 1;
  let needed = 3;
  while (left >= needed) {
    left -= needed;
    level++;
    needed += 2;
  }
  const week = days.slice(-7);
  return {
    today: days[days.length - 1].progress,
    weekAverage: week.reduce((s, d) => s + d.progress, 0) / week.length,
    streak,
    level,
    toNextLevel: left / needed,
    days,
  };
}
