import { addDays, DateKey, fromDateKey, toDateKey } from '@/lib/dates';
import type { IconName } from '@/state/habits';

// Challenges are dares you accept on purpose. A sprint is one timed sitting ("study for an
// hour"); a run is something done every day for a set number of days ("no sugar for a week").
// They're stored as JSON in the `challenges` setting, so they travel with sync and backups.

export type ChallengeKind = 'sprint' | 'run';
export type Tier = 'easy' | 'medium' | 'hard' | 'boss';
export type Category = 'study' | 'body' | 'mind' | 'home' | 'detox';

export type ChallengeIdea = {
  key: string;
  kind: ChallengeKind;
  title: string;
  blurb: string;
  icon: IconName;
  category: Category;
  minutes?: number;
  days?: number;
  // Leaving the app for more than a few seconds ends a lock-in sprint.
  lockIn?: boolean;
};

export type Challenge = {
  id: string;
  kind: ChallengeKind;
  title: string;
  icon: IconName;
  minutes?: number;
  days?: number;
  lockIn: boolean;
  status: 'active' | 'won' | 'lost';
  // Sprint: when the clock started. Run: when it was accepted.
  startedAt: number;
  startDay: DateKey;
  endedAt?: number;
  // Run: the days ticked off.
  doneDays: DateKey[];
  // Sprint: when the person left the app, cleared when they come back.
  awaySince?: number;
  // They left because of a call, so the longer CALL_LIMIT_MS applies instead of the grace.
  awayCall?: boolean;
  // Why a lost challenge was lost, shown in the history.
  lostReason?: string;
  points: number;
  // A focus session served in Phone Jail: the task (and day) it ticks off when won.
  focus?: { habitId: number; day: DateKey };
  // That task has been ticked off.
  claimed?: boolean;
};

export const LOCK_IN_GRACE_MS = 15_000;
// The phone can pause Mochi during a call, so it can't always tell when the call ended. Time
// away since the call was last seen is excused up to this, so a short call isn't a free pass.
export const CALL_LIMIT_MS = 5 * 60_000;

export const awayLimit = (call: boolean | undefined) => (call ? CALL_LIMIT_MS : LOCK_IN_GRACE_MS);

export const IDEAS: ChallengeIdea[] = [
  // Sprints
  {
    key: 'scholar',
    kind: 'sprint',
    title: 'The Scholar Hour',
    blurb: 'One full hour of studying. No breaks, no "quick check" of your phone.',
    icon: 'school-outline',
    category: 'study',
    minutes: 60,
    lockIn: true,
  },
  {
    key: 'pomodoro',
    kind: 'sprint',
    title: 'Pomodoro Punch',
    blurb: '25 minutes on the one thing you keep putting off.',
    icon: 'hourglass-outline',
    category: 'study',
    minutes: 25,
  },
  {
    key: 'bookworm',
    kind: 'sprint',
    title: 'Bookworm Sprint',
    blurb: 'Read for 30 minutes. A real book counts double in spirit.',
    icon: 'book-outline',
    category: 'mind',
    minutes: 30,
  },
  {
    key: 'phone-jail',
    kind: 'sprint',
    title: 'Phone Jail',
    blurb: 'Your phone goes face down for 45 minutes. Mochi keeps watch.',
    icon: 'phone-portrait-outline',
    category: 'detox',
    minutes: 45,
    lockIn: true,
  },
  {
    key: 'clean-sweep',
    kind: 'sprint',
    title: 'Clean Sweep',
    blurb: '15-minute tidy-up blitz. Put on a song and go.',
    icon: 'sparkles-outline',
    category: 'home',
    minutes: 15,
  },
  {
    key: 'write-500',
    kind: 'sprint',
    title: 'Write 500',
    blurb: '30 minutes to get 500 words down. Ugly drafts allowed.',
    icon: 'create-outline',
    category: 'study',
    minutes: 30,
  },
  {
    key: 'sweat',
    kind: 'sprint',
    title: 'Sweat Session',
    blurb: '20 minutes of moving. Push-ups, a run, dancing in your room.',
    icon: 'barbell-outline',
    category: 'body',
    minutes: 20,
  },
  {
    key: 'deep-work-boss',
    kind: 'sprint',
    title: 'Deep Work Boss',
    blurb: 'Two locked-in hours on your hardest work. The final boss.',
    icon: 'skull-outline',
    category: 'study',
    minutes: 120,
    lockIn: true,
  },
  // Runs
  {
    key: 'early-bird',
    kind: 'run',
    title: 'Early Bird ×5',
    blurb: 'Out of bed before 7 for five days straight.',
    icon: 'sunny-outline',
    category: 'body',
    days: 5,
  },
  {
    key: 'sugar-free',
    kind: 'run',
    title: 'Sugar-free Week',
    blurb: 'Seven days, no sweets, no soda.',
    icon: 'ice-cream-outline',
    category: 'body',
    days: 7,
  },
  {
    key: 'study-streak',
    kind: 'run',
    title: 'Study Streak',
    blurb: 'At least an hour of study every day for a week.',
    icon: 'library-outline',
    category: 'study',
    days: 7,
  },
  {
    key: 'no-scroll',
    kind: 'run',
    title: 'No-scroll Weekend',
    blurb: 'Two days without social media feeds.',
    icon: 'ban-outline',
    category: 'detox',
    days: 2,
  },
  {
    key: 'hydration',
    kind: 'run',
    title: 'Hydration Hero',
    blurb: 'Drink 2 litres of water a day for three days.',
    icon: 'water-outline',
    category: 'body',
    days: 3,
  },
  {
    key: 'cold-shower',
    kind: 'run',
    title: 'Cold Shower ×5',
    blurb: 'End every shower with 30 seconds of cold. Five days.',
    icon: 'snow-outline',
    category: 'body',
    days: 5,
  },
  {
    key: 'gratitude',
    kind: 'run',
    title: 'Gratitude 14',
    blurb: 'Write down three good things every night for two weeks.',
    icon: 'heart-outline',
    category: 'mind',
    days: 14,
  },
  {
    key: 'glow-up',
    kind: 'run',
    title: '30-Day Glow-up',
    blurb: 'Pick one thing that makes you better and do it for 30 days.',
    icon: 'rocket-outline',
    category: 'mind',
    days: 30,
  },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  study: 'Study',
  body: 'Body',
  mind: 'Mind',
  home: 'Home',
  detox: 'Detox',
};

export const TIER_LABEL: Record<Tier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  boss: 'Boss',
};

// XP for a win, set against tasks (a high-worth task is 20). Sprints pay by length: about
// 10 an hour for the first hour, then 14 an hour, with lock-in worth a sixth more, so a
// locked-in hour is 12 and two locked-in hours are 28. Runs pay for every day kept up.
export const RUN_XP_PER_DAY = 8;
const LOCK_IN_BONUS = 1.17;

export function tierOf(kind: ChallengeKind, amount: number): Tier {
  if (kind === 'sprint') {
    if (amount <= 20) return 'easy';
    if (amount <= 45) return 'medium';
    if (amount <= 90) return 'hard';
    return 'boss';
  }
  if (amount <= 3) return 'easy';
  if (amount <= 7) return 'medium';
  if (amount <= 14) return 'hard';
  return 'boss';
}

export function pointsFor(kind: ChallengeKind, amount: number, lockIn: boolean) {
  if (kind === 'run') return amount * RUN_XP_PER_DAY;
  const base = amount <= 60 ? amount / 6 : 10 + ((amount - 60) * 14) / 60;
  return Math.max(1, Math.round(lockIn ? base * LOCK_IN_BONUS : base));
}

// Phone Jail from the focus timer pays less than a challenge, since the task it ticks off
// pays too: 1 XP for every full 12 minutes, so 25 minutes is 2 and an hour is 5.
export const JAIL_XP_PER_HOUR = 5;
export const jailXp = (minutes: number) => Math.floor((minutes * JAIL_XP_PER_HOUR) / 60);

export function parseChallenges(raw: string): Challenge[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string') : [];
  } catch {
    return [];
  }
}

export function newChallenge(
  input: {
    kind: ChallengeKind;
    title: string;
    icon: IconName;
    minutes?: number;
    days?: number;
    lockIn: boolean;
    focus?: Challenge['focus'];
  },
  now = Date.now(),
): Challenge {
  const amount = (input.kind === 'sprint' ? input.minutes : input.days) ?? 1;
  return {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    lockIn: input.kind === 'sprint' && input.lockIn,
    status: 'active',
    startedAt: now,
    startDay: toDateKey(new Date(now)),
    doneDays: [],
    points: input.focus
      ? jailXp(amount)
      : pointsFor(input.kind, amount, input.kind === 'sprint' && input.lockIn),
  };
}

export function sprintEnd(c: Challenge) {
  return c.startedAt + (c.minutes ?? 0) * 60_000;
}

// A run is lost once a day between its start and yesterday wasn't ticked off.
export function missedDay(c: Challenge, todayKey: DateKey): DateKey | null {
  if (c.kind !== 'run') return null;
  for (let d = fromDateKey(c.startDay); toDateKey(d) < todayKey; d = addDays(d, 1)) {
    const key = toDateKey(d);
    if (!c.doneDays.includes(key)) return key;
  }
  return null;
}

// Settles anything that has ended since the app last looked: missed run days, and sprints
// whose time ran out (lost if a lock-in was left behind).
export function settle(list: Challenge[], now = Date.now()): Challenge[] {
  const todayKey = toDateKey(new Date(now));
  return list.map((c) => {
    if (c.status !== 'active') return c;
    if (c.kind === 'run') {
      const missed = missedDay(c, todayKey);
      if (missed) {
        return {
          ...c,
          status: 'lost',
          endedAt: now,
          lostReason: `Missed ${fromDateKey(missed).toLocaleDateString(undefined, {
            weekday: 'long',
          })}`,
        };
      }
      return c;
    }
    if (c.lockIn && c.awaySince && now - c.awaySince > awayLimit(c.awayCall)) {
      return { ...c, status: 'lost', endedAt: now, lostReason: 'Left the app' };
    }
    if (now >= sprintEnd(c)) {
      return { ...c, status: 'won', endedAt: sprintEnd(c), awaySince: undefined, awayCall: undefined };
    }
    return c;
  });
}

export function statsOf(list: Challenge[]) {
  const done = list.filter((c) => c.status !== 'active');
  const won = done.filter((c) => c.status === 'won');
  const points = won.reduce((sum, c) => sum + c.points, 0);
  // Wins in a row, counting back from the most recent finished challenge.
  const byEnd = [...done].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  let winStreak = 0;
  for (const c of byEnd) {
    if (c.status !== 'won') break;
    winStreak++;
  }
  return { points, won: won.length, finished: done.length, winStreak };
}

export function amountLabel(c: { kind: ChallengeKind; minutes?: number; days?: number }) {
  if (c.kind === 'run') return `${c.days} day${c.days === 1 ? '' : 's'}`;
  const m = c.minutes ?? 0;
  if (m < 60) return `${m} min`;
  return m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
