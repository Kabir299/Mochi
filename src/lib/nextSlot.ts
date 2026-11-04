import type { DateKey } from '@/lib/dates';

const DAY_MINUTES = 24 * 60;

// Where the last task added ends, so the next one can follow straight after it.
// Kept in memory on purpose: it only matters while adding tasks one after another.
let lastAdded: { day: DateKey; end: number } | null = null;

export function rememberAddedTask(day: DateKey, start: number, durationMin: number) {
  lastAdded = { day, end: start + durationMin };
}

// The default start for a new task: right after the task just added that day if it's
// still ahead of `from` (the next quarter hour), otherwise `from`. Then moved past any
// task already running at that time. Keeps `from` if that would run past midnight.
export function nextFreeMinute(
  day: DateKey,
  from: number,
  busy: { start: number; duration: number }[],
) {
  let minute = lastAdded?.day === day && lastAdded.end > from ? lastAdded.end : from;
  for (const task of [...busy].sort((a, b) => a.start - b.start)) {
    if (task.start <= minute && minute < task.start + task.duration) {
      minute = task.start + task.duration;
    }
  }
  return minute < DAY_MINUTES ? minute : from;
}
