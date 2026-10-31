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
