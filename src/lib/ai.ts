import Constants from 'expo-constants';

import { addDays, DateKey, lastNDays, toDateKey } from '@/lib/dates';
import type { FoodLog } from '@/lib/db';
import { purchaseUserId } from '@/lib/purchases';
import { secureGet, secureSet } from '@/lib/secureStorage';
import { HABIT_ICONS } from '@/lib/icons';
import type { PlanHabit } from '@/lib/profile';
import { habitStats } from '@/lib/stats';
import type { Habit, IconName } from '@/state/habits';

export type Analysis = {
  summary: string;
  wins: string[];
  improvements: { habit: string; issue: string; suggestion: string }[];
  goal_adjustments: {
    habit: string;
    change: 'easier' | 'harder';
    reason: string;
    new_target: number | null;
  }[];
  weekly_focus: string;
  nutrition: string;
};

const PERIOD_DAYS = 30;
const NUTRITION_DAYS = 14;
const REQUEST_TIMEOUT_MS = 120_000;
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// In development the AI server runs on the same computer as Metro, so reuse
// Metro's address. Set EXPO_PUBLIC_AI_URL once the server is deployed.
function serverUrl() {
  const configured = process.env.EXPO_PUBLIC_AI_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:8787`;
}

type PayloadInput = {
  today: Date;
  habits: Habit[];
  dayProgress: (day: DateKey) => number | null;
  habitProgress: (habit: Habit, day: DateKey) => number;
  streakFor: (habit: Habit, today: Date) => number;
  // Onboarding answers (goals, body goal, wake-up, prime time, work hours, pace).
  profile?: unknown;
  nutrition?: {
    waterGoalMl: number;
    calorieGoal: number;
    proteinGoal: number;
    waterFor: (day: DateKey) => number;
    foodFor: (day: DateKey) => FoodLog[];
  };
};

const percent = (v: number | null) => (v === null ? null : Math.round(v * 100));

function describeGoal(habit: Habit) {
  return habit.target > 1 ? `${habit.target} ${habit.unit ?? 'times'} per day` : 'check off once';
}

function describeSchedule(habit: Habit) {
  if (habit.repeat === 'days') return habit.days.map((d) => WEEKDAY_NAMES[d]).join(', ');
  return 'every day';
}

// Only aggregates leave the phone: names, rates and totals, no timestamps.
export function buildPayload(input: PayloadInput) {
  const { today } = input;
  const stats = habitStats(today, PERIOD_DAYS, input);

  return {
    today: toDateKey(today),
    period_days: PERIOD_DAYS,
    about_me: input.profile,
    daily_completion_percent: lastNDays(today, PERIOD_DAYS).map((d) => {
      const key = toDateKey(d);
      return { date: key, percent: percent(input.dayProgress(key)) };
    }),
    habits: stats.map(({ habit, rate, previousRate }) => ({
      name: habit.name,
      goal: describeGoal(habit),
      schedule: describeSchedule(habit),
      worth_points: habit.weight,
      tracking_since: habit.startDay,
      completion_percent_last_30_days: percent(rate),
      completion_percent_previous_30_days: percent(previousRate),
      current_streak: input.streakFor(habit, today),
    })),
    nutrition: input.nutrition && {
      water_goal_ml: input.nutrition.waterGoalMl,
      calorie_goal: input.nutrition.calorieGoal,
      protein_goal_g: input.nutrition.proteinGoal,
      days: lastNDays(today, NUTRITION_DAYS).map((d) => {
        const key = toDateKey(d);
        const food = input.nutrition!.foodFor(key);
        return {
          date: key,
          water_ml: input.nutrition!.waterFor(key),
          calories: food.reduce((s, f) => s + f.calories, 0),
          protein_g: food.reduce((s, f) => s + f.protein, 0),
          meals_logged: food.length,
        };
      }),
    },
  };
}

const PASS_ID = 'mochi-ai-pass';

async function send(path: string, body: unknown, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${serverUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Must match APP_KEY on the hosted server; not needed for the local one.
        ...(process.env.EXPO_PUBLIC_APP_KEY ? { 'x-app-key': process.env.EXPO_PUBLIC_APP_KEY } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      __DEV__
        ? "Can't reach the AI server. Start it on your computer (npm start in the server folder) and make sure your phone is on the same Wi-Fi."
        : "Can't reach Mochi's AI right now. Check your internet connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}

// This install's signed pass from the server, kept in the Keychain / Keystore.
async function installPass(renew = false) {
  if (!renew) {
    const saved = await secureGet(PASS_ID);
    if (saved) return saved;
  }
  const response = await send('/register', {}, {});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? 'Couldn’t connect to Mochi’s AI.');
  // The local server hands out no pass; that's fine.
  if (data?.token) await secureSet(PASS_ID, data.token);
  return (data?.token as string | null) ?? '';
}

async function post<T>(path: string, body: unknown, renewed = false): Promise<T> {
  const headers: Record<string, string> = {};
  const pass = await installPass(renewed);
  if (pass) headers['x-install-token'] = pass;
  // Lets the server confirm Pro with RevenueCat instead of trusting the phone.
  const userId = await purchaseUserId();
  if (userId) headers['x-user-id'] = userId;

  const response = await send(path, body, headers);
  const data = await response.json().catch(() => null);
  if (response.status === 401 && data?.code === 'register' && !renewed) {
    return post<T>(path, body, true);
  }
  if (!response.ok) {
    throw new Error(data?.error ?? `The AI server returned an error (${response.status}).`);
  }
  return data as T;
}

export function requestAnalysis(payload: ReturnType<typeof buildPayload>) {
  return post<Analysis>('/analyze', payload);
}

export type Priority = 'high' | 'medium' | 'low';

export type DayPlan = {
  plan: {
    id: number;
    start_time: string;
    duration_min: number;
    priority: Priority;
    reason: string;
  }[];
  // Tasks left out because they didn't fit the time budget or window.
  skipped: { id: number; reason: string }[];
  summary: string;
};

export type PlanTask = {
  id: number;
  name: string;
  start_time: string | null;
  duration_min: number | null;
  done: boolean;
  fixed: boolean;
  // null lets the AI decide.
  priority: Priority | null;
};

export function requestDayPlan(body: {
  day: string;
  now: string;
  // When the person wants to do the flexible tasks; null means any time.
  work_window: { from: string; to: string } | null;
  // Total minutes for all flexible tasks together; null means no limit.
  time_budget_min: number | null;
  tasks: PlanTask[];
}) {
  return post<DayPlan>('/plan-day', body);
}

export type ChatMessage = {
  role: 'user' | 'coach';
  content: string;
  // Habits the coach offered, shown as cards to add with a tap.
  habits?: PlanHabit[];
};

export async function requestChat(messages: ChatMessage[], stats: ReturnType<typeof buildPayload>) {
  const result = await post<{ reply: string; habits?: SuggestedHabit[] }>('/chat', {
    conversation: messages.map(({ role, content }) => ({ role, content })),
    stats,
    allowed_icons: HABIT_ICONS,
  });
  // An older server sends no habits.
  const habits = Array.isArray(result.habits) ? result.habits.slice(0, 5).map(toPlanHabit) : [];
  return { reply: result.reply, habits };
}

export type DumpTask = {
  name: string;
  icon: string;
  start_time: string | null;
  duration_min: number | null;
  repeat: 'once' | 'daily';
  weight: number;
  target: number;
  unit: string | null;
};

export function requestBrainDump(body: {
  text: string;
  day: string;
  // Weekday name and "HH:MM" now (null when planning another day), so relative times work.
  weekday: string;
  now: string | null;
  existing: { name: string; start_time: string | null; duration_min: number | null }[];
  allowed_icons: string[];
}) {
  return post<{ tasks: DumpTask[]; note: string }>('/brain-dump', body);
}

export type FoodEstimate = {
  items: { name: string; portion: string; calories: number; protein_g: number }[];
  total_calories: number;
  total_protein_g: number;
};

export function requestFoodEstimate(meal: string) {
  return post<FoodEstimate>('/estimate-food', { meal });
}

export type SuggestedHabit = {
  name: string;
  icon: string;
  days: number[];
  start_time: string | null;
  duration_min: number | null;
  weight: number;
  target: number;
  unit: string | null;
  why: string;
};

export function requestOnboardPlan(body: {
  answers: unknown;
  draft: unknown;
  allowed_icons: string[];
}) {
  return post<{ summary: string; habits: SuggestedHabit[] }>('/onboard-plan', body);
}

const FALLBACK_ICON: IconName = 'checkmark-circle-outline';

// Turns a habit the AI suggested into one the app can save, keeping every value in range.
export function toPlanHabit(h: SuggestedHabit): PlanHabit {
  const start = timeToMinute(h.start_time);
  const days = [...new Set((h.days ?? []).filter((d) => d >= 0 && d <= 6))].sort();
  const target = Math.min(99, Math.max(1, Math.round(h.target || 1)));
  return {
    name: String(h.name ?? '').slice(0, 40),
    icon: (HABIT_ICONS as string[]).includes(h.icon) ? (h.icon as IconName) : FALLBACK_ICON,
    target,
    unit: target > 1 ? h.unit : null,
    repeat: days.length > 0 && days.length < 7 ? 'days' : 'daily',
    days: days.length < 7 ? days : [],
    weight: Math.min(3, Math.max(1, Math.round(h.weight || 2))),
    startMinute: start,
    durationMin: start === null ? null : Math.max(5, h.duration_min ?? 30),
    onceDay: null,
    why: h.why ?? '',
  };
}

// "HH:MM" <-> minutes after midnight.
export function timeToMinute(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute < 1440 ? minute : null;
}

export function minuteToTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

// True when there's at least a few days of history worth analyzing.
export function hasEnoughData(today: Date, dayProgress: (day: DateKey) => number | null) {
  let days = 0;
  for (let i = 0; i < PERIOD_DAYS; i++) {
    if (dayProgress(toDateKey(addDays(today, -i))) !== null) days++;
  }
  return days >= 1;
}
