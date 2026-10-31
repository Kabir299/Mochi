// Dates are stored as local "YYYY-MM-DD" keys so a check-in belongs to the
// day the user saw on their phone, not a UTC day.
export type DateKey = string;

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Monday-first week containing `date`.
export function weekDays(date: Date): Date[] {
  const mondayOffset = (date.getDay() + 6) % 7;
  const monday = addDays(date, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// SQLite stores datetime('now') in UTC; convert to the local day it happened.
export function sqliteUtcToDateKey(timestamp: string): DateKey {
  return toDateKey(new Date(timestamp.replace(' ', 'T') + 'Z'));
}

// Oldest first, ending with `today`.
export function lastNDays(today: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

// 540 -> "9:00 AM" (or "09:00" in 24-hour locales).
export function formatMinute(minute: number): string {
  const date = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// 95 -> "1h 35m"
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
