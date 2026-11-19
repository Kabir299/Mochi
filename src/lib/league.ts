import { Challenge, pointsFor } from '@/lib/challenges';
import { addDays, DateKey, fromDateKey, toDateKey } from '@/lib/dates';
import type { Habit } from '@/state/habits';

// XP and weekly leagues. XP is worked out from what's already saved (check-ins and won
// challenges), so it syncs and restores with everything else. The league only stores which
// tier you're in and past results; the rivals are made up the same way on every device.

// ---------- XP ----------

// Per habit done, by its worth (weight 1 low, 2 medium, 3 high). Partial counts give part.
export const HABIT_XP: Record<number, number> = { 1: 5, 2: 10, 3: 20 };
export const STREAK_DAY_XP = 10;
export const PERFECT_DAY_XP = 20;
// Habits can't flood the league: a day's check-ins give at most this (bonuses on top).
export const DAILY_HABIT_CAP = 150;
// A challenge gives 8 (easy) to 28 (locked-in boss) XP, worked out from its size now, so
// ones saved under older, bigger values don't count extra. A day's challenges give at most
// this, so repeating short sprints can't farm the league.
export const DAILY_CHALLENGE_CAP = 60;

export const challengeXp = (c: Pick<Challenge, 'kind' | 'minutes' | 'days' | 'lockIn'>) =>
  pointsFor(c.kind, (c.kind === 'sprint' ? c.minutes : c.days) ?? 1, c.lockIn);

export type XpSource = {
  allHabits: Habit[];
  habitProgress: (habit: Habit, day: DateKey) => number;
  dayProgress: (day: DateKey) => number | null;
  threshold: number;
  challenges: Challenge[];
};

export function dayXp(day: DateKey, s: XpSource) {
  let habits = 0;
  for (const h of s.allHabits) {
    const p = s.habitProgress(h, day);
    if (p > 0) habits += (HABIT_XP[h.weight] ?? 10) * p;
  }
  habits = Math.min(DAILY_HABIT_CAP, Math.round(habits));
  const progress = s.dayProgress(day);
  const bonus =
    progress === null
      ? 0
      : (progress >= s.threshold ? STREAK_DAY_XP : 0) + (progress >= 1 ? PERFECT_DAY_XP : 0);
  const challengeTotal = s.challenges
    .filter((c) => c.status === 'won' && c.endedAt && toDateKey(new Date(c.endedAt)) === day)
    .reduce((sum, c) => sum + challengeXp(c), 0);
  const challenges = Math.min(DAILY_CHALLENGE_CAP, challengeTotal);
  return { habits, bonus, challenges, total: habits + bonus + challenges };
}

// ---------- Weeks ----------

export function weekStart(date: Date): DateKey {
  return toDateKey(addDays(date, -((date.getDay() + 6) % 7)));
}

export function weekDayKeys(week: DateKey): DateKey[] {
  const monday = fromDateKey(week);
  return Array.from({ length: 7 }, (_, i) => toDateKey(addDays(monday, i)));
}

// XP earned in the week, up to and including `until` (defaults to the whole week).
export function weekXp(week: DateKey, s: XpSource, until?: DateKey) {
  return weekDayKeys(week)
    .filter((d) => !until || d <= until)
    .reduce((sum, d) => sum + dayXp(d, s).total, 0);
}

// ---------- Tiers ----------

export const TIERS = [
  { name: 'Sprout', color: '#8BC34A', icon: 'leaf-outline' },
  { name: 'Pebble', color: '#9E9E9E', icon: 'ellipse-outline' },
  { name: 'Blossom', color: '#F48FB1', icon: 'flower-outline' },
  { name: 'Bamboo', color: '#4CAF50', icon: 'git-commit-outline' },
  { name: 'Jade', color: '#26A69A', icon: 'diamond-outline' },
  { name: 'Moonstone', color: '#90CAF9', icon: 'moon-outline' },
  { name: 'Comet', color: '#FFB74D', icon: 'flash-outline' },
  { name: 'Aurora', color: '#BA68C8', icon: 'color-wand-outline' },
  { name: 'Nebula', color: '#7986CB', icon: 'planet-outline' },
  { name: 'Mochi Legend', color: '#EFC45A', icon: 'trophy' },
] as const;

export const LEAGUE_SIZE = 15;
export const PROMOTE = 5;
export const DEMOTE = 4;

// ---------- Rivals ----------

const NAMES = [
  'Pixel',
  'Noodle',
  'Biscuit',
  'Captain Nap',
  'Waffles',
  'Zephyr',
  'Momo',
  'Taro',
  'Dumpling',
  'Sir Snooze',
  'Kiwi',
  'Boba',
  'Mango',
  'Pebbles',
  'Toast',
  'Yuzu',
  'Nimbus',
  'Pickles',
  'Sushi',
  'Juno',
  'Miso',
  'Bean',
  'Tofu',
  'Sprinkles',
  'Comet Kid',
  'Doodle',
  'Maple',
  'Pudding',
  'Ziggy',
  'Lemon',
  'Hazel',
  'Rocket',
  'Peanut',
  'Cocoa',
  'Bubbles',
  'Ramen',
  'Nova',
  'Clover',
  'Gizmo',
  'Truffle',
];
const COLORS = ['#5DCAA5', '#F2A88B', '#85B7EB', '#B9A3F0', '#EFC45A', '#F48FB1', '#9CCC65'];

// How a rival spreads their week: early birds front-load, crammers finish strong.
type Style = 'early' | 'steady' | 'crammer';
const SHAPE: Record<Style, number> = { early: 0.6, steady: 1, crammer: 1.8 };

export type Player = {
  id: string;
  name: string;
  color: string;
  xp: number;
  you?: boolean;
  ai?: boolean;
};

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// What a normal week looks like for you: the average of your last three weeks, so rivals
// grow with you. New players start against a gentle field.
export function typicalWeek(week: DateKey, s: XpSource) {
  const past = [1, 2, 3].map((i) => weekXp(toDateKey(addDays(fromDateKey(week), -7 * i)), s));
  const avg = past.reduce((a, b) => a + b, 0) / past.length;
  return Math.max(250, Math.round(avg));
}

// Share of the week gone, 0..1, at `now`.
export function weekElapsed(week: DateKey, now: Date) {
  const start = fromDateKey(week).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (7 * 86_400_000)));
}

export function rivals(
  week: DateKey,
  tier: number,
  base: number,
  elapsed: number,
  aiBuddy: string | null,
): Player[] {
  const rand = seeded(`${week}:${tier}`);
  const names = [...NAMES];
  const count = LEAGUE_SIZE - 1;
  const boost = 1 + tier * 0.07;
  const list: Player[] = [];
  for (let i = 0; i < count; i++) {
    const isAi = aiBuddy !== null && i === 0;
    const name = isAi ? aiBuddy : names.splice(Math.floor(rand() * names.length), 1)[0];
    // Spread from well behind to well ahead of a normal week for you.
    const target = base * boost * (isAi ? 1.1 : 0.35 + rand() * 1.25);
    const style: Style = (['early', 'steady', 'crammer'] as const)[Math.floor(rand() * 3)];
    const jitter = 0.85 + rand() * 0.3;
    // Grows in daily steps with a little smoothing inside the day, like real check-ins.
    const steps = Math.floor(elapsed * 7) / 7 + ((elapsed * 7) % 1) * 0.6 * (1 / 7);
    const shaped = Math.pow(Math.min(1, steps * jitter), SHAPE[style]);
    list.push({
      id: `r${i}`,
      name,
      color: COLORS[Math.floor(rand() * COLORS.length)],
      xp: Math.round((target * shaped) / 5) * 5,
      ai: isAi,
    });
  }
  return list;
}

export function standings(you: number, others: Player[], youName: string): Player[] {
  return [{ id: 'you', name: youName, color: '', xp: you, you: true }, ...others].sort(
    (a, b) => b.xp - a.xp || (a.you ? -1 : b.you ? 1 : 0),
  );
}

export type Move = 'up' | 'down' | 'stay';

export function moveFor(rank: number, tier: number): Move {
  if (rank <= PROMOTE && tier < TIERS.length - 1) return 'up';
  if (rank > LEAGUE_SIZE - DEMOTE && tier > 0) return 'down';
  return 'stay';
}

// ---------- Saved state ----------

export type WeekResult = { week: DateKey; tier: number; rank: number; xp: number; move: Move };
export type LeagueState = {
  tier: number;
  week: DateKey;
  results: WeekResult[];
  // The latest result already shown to the person.
  seen: DateKey;
};

export function parseLeague(raw: string, currentWeek: DateKey): LeagueState {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.tier === 'number' && typeof v.week === 'string') {
      return { results: [], seen: '', ...v };
    }
  } catch {}
  return { tier: 0, week: currentWeek, results: [], seen: '' };
}

// Finishes every week that ended since the app last looked, moving up or down each time.
export function settleLeague(
  state: LeagueState,
  currentWeek: DateKey,
  s: XpSource,
  aiBuddy: string | null,
): LeagueState {
  if (state.week >= currentWeek) return state;
  let { tier, week } = state;
  const results = [...state.results];
  for (let n = 0; week < currentWeek && n < 52; n++) {
    const you = weekXp(week, s);
    const table = standings(you, rivals(week, tier, typicalWeek(week, s), 1, aiBuddy), 'You');
    const rank = table.findIndex((p) => p.you) + 1;
    const move = moveFor(rank, tier);
    results.push({ week, tier, rank, xp: you, move });
    tier += move === 'up' ? 1 : move === 'down' ? -1 : 0;
    week = toDateKey(addDays(fromDateKey(week), 7));
  }
  return { ...state, tier, week: currentWeek, results: results.slice(-20) };
}
