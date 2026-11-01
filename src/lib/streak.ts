import { addDays, DateKey, fromDateKey, toDateKey } from '@/lib/dates';

// A day keeps the streak alive when daily progress reaches this.
export const STREAK_THRESHOLD = 0.8;
export const FREEZES_PER_MONTH = 3;

export type DayStreak = {
  current: number;
  best: number;
  freezesLeft: number;
  // Missed days that a freeze covered.
  frozenDays: Set<DateKey>;
};

const monthOf = (day: DateKey) => day.slice(0, 7);

// Replays history from the first tracked day to today. Days with nothing
// scheduled are neutral. A missed day (below the threshold) spends one of
// that month's freezes if the streak is running and one is left, otherwise
// the streak resets. Today only counts once it reaches the threshold; until
// then it can't break anything. Recomputed from history so nothing extra is stored.
export function computeDayStreak(
  firstDay: DateKey | null,
  today: Date,
  dayProgress: (day: DateKey) => number | null,
  threshold = STREAK_THRESHOLD,
  freezesPerMonth = FREEZES_PER_MONTH,
): DayStreak {
  const todayKey = toDateKey(today);
  const frozenDays = new Set<DateKey>();
  const usedByMonth = new Map<string, number>();
  let current = 0;
  let best = 0;

  if (firstDay && firstDay <= todayKey) {
    for (let date = fromDateKey(firstDay); toDateKey(date) <= todayKey; date = addDays(date, 1)) {
      const key = toDateKey(date);
      const progress = dayProgress(key);
      if (progress === null) continue;

      if (progress >= threshold) {
        current++;
        best = Math.max(best, current);
      } else if (key === todayKey) {
        // Still in progress.
      } else if (current > 0 && (usedByMonth.get(monthOf(key)) ?? 0) < freezesPerMonth) {
        usedByMonth.set(monthOf(key), (usedByMonth.get(monthOf(key)) ?? 0) + 1);
        frozenDays.add(key);
      } else {
        current = 0;
      }
    }
  }

  return {
    current,
    best,
    freezesLeft: freezesPerMonth - (usedByMonth.get(monthOf(todayKey)) ?? 0),
    frozenDays,
  };
}

// Repairs allowed per month, on top of the automatic freezes.
export const REPAIRS_PER_MONTH = 1;

export const parseDays = (csv: string) => new Set(csv.split(',').filter(Boolean));

// A repaired day counts as a kept day.
export function withRepairs(
  dayProgress: (day: DateKey) => number | null,
  repairedCsv: string,
): (day: DateKey) => number | null {
  const repaired = parseDays(repairedCsv);
  if (repaired.size === 0) return dayProgress;
  return (day) => (repaired.has(day) ? 1 : dayProgress(day));
}

export type Yesterday =
  | { kind: 'fine' }
  // A freeze covered it; the streak lives on.
  | { kind: 'frozen'; day: DateKey; streak: number; freezesLeft: number }
  // The streak broke; it can be repaired if one is left this month.
  | { kind: 'broken'; day: DateKey; lost: number; canRepair: boolean };

// How yesterday went for the streak, so Today can say something kind about it.
export function yesterdayStatus(
  firstDay: DateKey | null,
  today: Date,
  dayProgress: (day: DateKey) => number | null,
  repairedCsv: string,
  threshold = STREAK_THRESHOLD,
  freezesPerMonth = FREEZES_PER_MONTH,
): Yesterday {
  const day = toDateKey(addDays(today, -1));
  const progress = withRepairs(dayProgress, repairedCsv);
  const value = progress(day);
  if (value === null || value >= threshold) return { kind: 'fine' };

  const now = computeDayStreak(firstDay, today, progress, threshold, freezesPerMonth);
  if (now.frozenDays.has(day)) {
    return { kind: 'frozen', day, streak: now.current, freezesLeft: now.freezesLeft };
  }
  // The streak as it stood before yesterday (the day before counts as finished then).
  const before = computeDayStreak(firstDay, addDays(today, -2), progress, threshold, freezesPerMonth);
  const lost = before.current;
  if (lost < 2) return { kind: 'fine' };
  const month = day.slice(0, 7);
  const usedThisMonth = [...parseDays(repairedCsv)].filter((d) => d.startsWith(month)).length;
  return { kind: 'broken', day, lost, canRepair: usedThisMonth < REPAIRS_PER_MONTH };
}

// Rest days (Pro): weekdays (0 = Sunday) where skipping doesn't break the streak. A rest
// day that was done anyway still counts.
export function withRestDays(
  dayProgress: (day: DateKey) => number | null,
  restDaysCsv: string,
  threshold = STREAK_THRESHOLD,
): (day: DateKey) => number | null {
  const rest = new Set(restDaysCsv.split(',').filter(Boolean).map(Number));
  if (rest.size === 0) return dayProgress;
  return (day) => {
    const progress = dayProgress(day);
    if (progress === null || progress >= threshold) return progress;
    return rest.has(fromDateKey(day).getDay()) ? null : progress;
  };
}

// The day progress the streak is counted from: rest days and repairs applied.
export function streakProgress(
  dayProgress: (day: DateKey) => number | null,
  opts: { repairedDays: string; restDays: string; threshold: number },
) {
  return withRepairs(withRestDays(dayProgress, opts.restDays, opts.threshold), opts.repairedDays);
}
