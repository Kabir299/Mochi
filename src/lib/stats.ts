import { addDays, DateKey, lastNDays, toDateKey } from '@/lib/dates';
import { isScheduled, type Habit } from '@/state/habits';

export type DayPoint = {
  date: Date;
  key: DateKey;
  // 0..1, or null when no habits existed that day.
  value: number | null;
};

export type HabitStat = {
  habit: Habit;
  rate: number | null;
  previousRate: number | null;
};

export type Insight = {
  icon:
    | 'trophy-outline'
    | 'alert-circle-outline'
    | 'calendar-outline'
    | 'flame-outline'
    | 'trending-up-outline'
    | 'trending-down-outline';
  text: string;
};

type ProgressFns = {
  habits: Habit[];
  dayProgress: (day: DateKey) => number | null;
  habitProgress: (habit: Habit, day: DateKey) => number;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
}

export function series(
  today: Date,
  days: number,
  dayProgress: ProgressFns['dayProgress'],
): DayPoint[] {
  return lastNDays(today, days).map((date) => {
    const key = toDateKey(date);
    return { date, key, value: dayProgress(key) };
  });
}

// Completion rate per repeating habit over the window, and over the window
// before it. Only days the habit was scheduled count; one-off tasks are left out.
export function habitStats(today: Date, days: number, fns: ProgressFns): HabitStat[] {
  const current = lastNDays(today, days).map(toDateKey);
  const previous = lastNDays(addDays(today, -days), days).map(toDateKey);
  const rate = (habit: Habit, keys: DateKey[]) =>
    average(keys.filter((k) => isScheduled(habit, k)).map((k) => fns.habitProgress(habit, k)));
  return fns.habits
    .filter((h) => h.repeat !== 'once')
    .map((habit) => ({
      habit,
      rate: rate(habit, current),
      previousRate: rate(habit, previous),
    }));
}

// Plain-language observations that work offline, no AI needed.
export function insights(today: Date, days: number, fns: ProgressFns): Insight[] {
  const out: Insight[] = [];
  const stats = habitStats(today, days, fns).filter((s) => s.rate !== null);
  if (stats.length === 0) return out;

  const sorted = [...stats].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  out.push({
    icon: 'trophy-outline',
    text: `${best.habit.name} is your strongest habit at ${pct(best.rate)} completion.`,
  });
  if (worst !== best && (worst.rate ?? 0) < 0.7) {
    out.push({
      icon: 'alert-circle-outline',
      text: `${worst.habit.name} needs attention at ${pct(worst.rate)}. Try making it smaller or pairing it with something you already do.`,
    });
  }

  // Best and worst weekday, needs at least two weeks of data to mean anything.
  const points = series(today, Math.max(days, 14), fns.dayProgress).filter((p) => p.value !== null);
  if (points.length >= 14) {
    const byWeekday = WEEKDAYS.map((_, wd) =>
      average(points.filter((p) => p.date.getDay() === wd).map((p) => p.value)),
    );
    const ranked = byWeekday
      .map((v, wd) => ({ v, wd }))
      .filter((d): d is { v: number; wd: number } => d.v !== null)
      .sort((a, b) => b.v - a.v);
    if (ranked.length >= 2 && ranked[0].v - ranked[ranked.length - 1].v >= 0.15) {
      out.push({
        icon: 'calendar-outline',
        text: `${WEEKDAYS[ranked[0].wd]}s are your best days. ${WEEKDAYS[ranked[ranked.length - 1].wd]}s slip the most, so plan for them.`,
      });
    }
  }

  const improving = stats
    .filter((s) => s.previousRate !== null && (s.rate ?? 0) - (s.previousRate ?? 0) >= 0.15)
    .sort((a, b) => b.rate! - b.previousRate! - (a.rate! - a.previousRate!))[0];
  if (improving) {
    out.push({
      icon: 'trending-up-outline',
      text: `${improving.habit.name} is up ${points1(improving.rate! - improving.previousRate!)} on the previous ${days} days.`,
    });
  }
  const slipping = stats
    .filter((s) => s.previousRate !== null && (s.previousRate ?? 0) - (s.rate ?? 0) >= 0.15)
    .sort((a, b) => b.previousRate! - b.rate! - (a.previousRate! - a.rate!))[0];
  if (slipping) {
    out.push({
      icon: 'trending-down-outline',
      text: `${slipping.habit.name} dropped ${points1(slipping.previousRate! - slipping.rate!)} compared with the previous ${days} days.`,
    });
  }

  return out;
}

export function pct(value: number | null) {
  return value === null ? '–' : `${Math.round(value * 100)}%`;
}

// Difference between two rates, in percentage points.
export function points1(delta: number) {
  return `${Math.round(Math.abs(delta) * 100)} pts`;
}
