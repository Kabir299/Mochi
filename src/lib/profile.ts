import type { HabitInput, IconName } from '@/state/habits';
import type { Settings } from '@/state/settings';

// What the user told us on first launch (and the body goal from the Nutrition tab),
// used to build their plan and passed to the AI coach so its advice fits them.
// When to work, and for how long, is asked in Plan my day instead.
export type GoalId =
  | 'workout'
  | 'sleep'
  | 'wake'
  | 'meditate'
  | 'read'
  | 'learn'
  | 'deep'
  | 'water'
  | 'eat'
  | 'screen'
  | 'journal';
export type Physique = 'lose_fat' | 'build_muscle' | 'fitter' | 'maintain' | 'none';
export type Pace = 'easy' | 'steady' | 'all_in';

export type Profile = {
  goals: GoalId[];
  other: string;
  physique: Physique;
  weightKg: number | null;
  wakeMinute: number;
  pace: Pace;
};

export const DEFAULT_PROFILE: Profile = {
  goals: [],
  other: '',
  physique: 'none',
  weightKg: null,
  wakeMinute: 7 * 60,
  pace: 'easy',
};

export const GOALS: { id: GoalId; label: string; icon: IconName }[] = [
  { id: 'workout', label: 'Work out', icon: 'barbell-outline' },
  { id: 'wake', label: 'Wake up early', icon: 'sunny-outline' },
  { id: 'sleep', label: 'Sleep better', icon: 'bed-outline' },
  { id: 'meditate', label: 'Meditate', icon: 'leaf-outline' },
  { id: 'read', label: 'Read more', icon: 'book-outline' },
  { id: 'learn', label: 'Learn a skill', icon: 'language-outline' },
  { id: 'deep', label: 'Deep work', icon: 'code-slash-outline' },
  { id: 'water', label: 'Drink more water', icon: 'water-outline' },
  { id: 'eat', label: 'Eat healthier', icon: 'nutrition-outline' },
  { id: 'screen', label: 'Less screen time', icon: 'phone-portrait-outline' },
  { id: 'journal', label: 'Journal', icon: 'pencil-outline' },
];

export const PHYSIQUES: { id: Physique; label: string; hint: string }[] = [
  { id: 'lose_fat', label: 'Lose fat', hint: 'Daily steps, cardio, steady eating' },
  { id: 'build_muscle', label: 'Build muscle', hint: 'Strength training and protein' },
  { id: 'fitter', label: 'Get fitter', hint: 'Stamina and regular workouts' },
  { id: 'maintain', label: 'Stay healthy', hint: 'Move a little every day' },
  { id: 'none', label: 'Not a focus right now', hint: 'Skip body goals' },
];

export const PACES: { id: Pace; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy start', hint: 'A few small habits, build up slowly' },
  { id: 'steady', label: 'Steady', hint: 'A balanced plan you can keep' },
  { id: 'all_in', label: 'All in', hint: 'More habits, higher bar' },
];

export function parseProfile(raw: string): Profile | null {
  if (!raw) return null;
  try {
    // Older saves also had primeTime / workHours; they are simply dropped.
    const { primeTime: _p, workHours: _w, ...saved } = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...saved };
  } catch {
    return null;
  }
}

// A habit in the suggested plan, with a short reason shown on the review screen.
export type PlanHabit = HabitInput & { why: string };

const DAY = 24 * 60;

// Builds a plan on the phone from the answers, without the AI. Timed habits are
// placed so they don't overlap (with each other or the `taken` slots), and the pace
// decides how many habits and how big they are.
export function buildLocalPlan(p: Profile, taken: [number, number][] = []): PlanHabit[] {
  const busy: [number, number][] = [...taken];
  const isFree = (start: number, len: number) =>
    start >= 0 &&
    start + len <= DAY &&
    busy.every(([s, e]) => start + len <= s || start >= e);
  // Next free slot at or after the preferred time (wrapping back earlier if needed).
  const place = (preferred: number, len: number) => {
    const from = Math.max(0, Math.min(preferred, DAY - len));
    for (let t = from; t + len <= DAY; t += 15) {
      if (isFree(t, len)) {
        busy.push([t, t + len]);
        return t;
      }
    }
    for (let t = from - 15; t >= 0; t -= 15) {
      if (isFree(t, len)) {
        busy.push([t, t + len]);
        return t;
      }
    }
    return null;
  };

  const size = <T>(easy: T, steady: T, allIn: T) =>
    p.pace === 'easy' ? easy : p.pace === 'steady' ? steady : allIn;
  const wake = p.wakeMinute;
  const bedtime = (wake - 8 * 60 + DAY) % DAY;
  // Evening habits end by bedtime, or by 11:30 PM when bedtime is after midnight.
  const lateBed = bedtime < 12 * 60;
  const eveningEnd = lateBed ? 23 * 60 + 30 : bedtime;
  // Early evening suits most people; Plan my day can move it.
  const workoutAt = 18 * 60;

  const base = { target: 1, unit: null, onceDay: null, days: [] as number[] };
  const timed = (
    name: string,
    icon: IconName,
    preferred: number,
    len: number,
    weight: 1 | 2 | 3,
    why: string,
    days: number[] = [],
  ): PlanHabit => ({
    ...base,
    name,
    icon,
    weight,
    why,
    repeat: days.length > 0 ? 'days' : 'daily',
    days,
    durationMin: len,
    startMinute: place(preferred, len),
  });
  const anyTime = (
    name: string,
    icon: IconName,
    weight: 1 | 2 | 3,
    why: string,
    target = 1,
    unit: string | null = null,
  ): PlanHabit => ({
    ...base,
    name,
    icon,
    weight,
    why,
    target,
    unit,
    repeat: 'daily',
    startMinute: null,
    durationMin: null,
  });

  // The wake-up anchor is placed first so the rest fits around it.
  const anchors: PlanHabit[] = [];
  if (p.goals.includes('wake')) {
    anchors.push(
      timed(
        `Wake up at ${clock(wake)}`,
        'sunny-outline',
        wake,
        15,
        2,
        'A fixed wake-up time anchors the rest of the day.',
      ),
    );
  }

  // Everything else, most important first; the pace decides how many make the cut.
  const rest: PlanHabit[] = [];
  const workoutDays = size([1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5, 6]);
  switch (p.physique) {
    case 'build_muscle':
      rest.push(
        timed(
          'Strength workout',
          'barbell-outline',
          workoutAt,
          60,
          3,
          `${workoutDays.length} sessions a week to build muscle.`,
          workoutDays,
        ),
        anyTime('Protein with every meal', 'nutrition-outline', 2, 'Muscle needs protein spread over the day.', 3, 'meals'),
      );
      break;
    case 'lose_fat':
      rest.push(
        anyTime(
          `Walk ${size('7k', '10k', '12k')} steps`,
          'walk-outline',
          3,
          'Daily steps burn more than you think and are easy to keep.',
        ),
        timed('Cardio or workout', 'bicycle-outline', workoutAt, 45, 2, 'Keeps muscle while you lose fat.', workoutDays),
        anyTime('No sugary snacks', 'nutrition-outline', 1, 'Small swaps add up.'),
      );
      break;
    case 'fitter':
      rest.push(
        timed('Workout', 'barbell-outline', workoutAt, 45, 3, 'Regular sessions build stamina.', workoutDays),
        anyTime(`Walk ${size('6k', '8k', '10k')} steps`, 'walk-outline', 2, 'Easy daily movement on top of workouts.'),
      );
      break;
    case 'maintain':
      rest.push(
        timed('Move for 30 minutes', 'walk-outline', workoutAt, 30, 2, 'A little movement every day keeps you healthy.'),
      );
      break;
    case 'none':
      break;
  }

  const sleepWhy = `8 hours before your ${clock(wake)} wake-up.`;
  const has = (word: string) => rest.some((h) => h.name.toLowerCase().includes(word));
  for (const goal of p.goals) {
    switch (goal) {
      case 'workout':
        if (!has('workout')) {
          rest.push(timed('Workout', 'barbell-outline', workoutAt, 45, 3, 'Your workout days.', workoutDays));
        }
        break;
      case 'meditate':
        rest.push(
          timed('Meditate', 'leaf-outline', wake + 15, size(10, 15, 20), 2, 'Right after waking, before the day gets busy.'),
        );
        break;
      case 'read':
        rest.push(
          timed('Read', 'book-outline', eveningEnd - 75, size(20, 30, 45), 2, 'An evening slot that also helps you wind down.'),
        );
        break;
      case 'learn':
        rest.push(
          timed('Practice a new skill', 'language-outline', 19 * 60 + 30, size(20, 30, 45), 2, 'Short daily practice beats long rare sessions.'),
        );
        break;
      case 'water':
        rest.push(anyTime('Drink water', 'water-outline', 1, 'Tap + each glass.', size(6, 8, 10), 'glasses'));
        break;
      case 'eat':
        rest.push(anyTime('Veggies or fruit', 'nutrition-outline', 2, 'A simple way to eat better.', size(2, 3, 4), 'servings'));
        break;
      case 'screen':
        rest.push(
          timed('Phone-free hour', 'phone-portrait-outline', eveningEnd - 120, 60, 2, 'Phone away for an hour every evening.'),
        );
        break;
      case 'journal':
        rest.push(timed('Journal', 'pencil-outline', eveningEnd - 30, 10, 1, 'Two minutes on how the day went.'));
        break;
      case 'sleep':
        rest.push(
          lateBed
            ? anyTime(`Lights out by ${clock(bedtime)}`, 'moon-outline', 2, sleepWhy)
            : timed(`Lights out by ${clock(bedtime)}`, 'moon-outline', bedtime, 15, 2, sleepWhy),
        );
        break;
      case 'deep':
        // No fixed time: Plan my day asks when and for how long.
        rest.push(
          anyTime('Deep work', 'code-slash-outline', 3, 'Pick when and how long in Plan my day.'),
        );
        break;
      case 'wake':
        break;
    }
  }

  const plan = [...anchors, ...rest.slice(0, size(4, 6, 9))];
  if (p.other.trim()) {
    plan.push({
      ...anyTime(p.other.trim().slice(0, 40), 'checkmark-circle-outline', 2, 'Something you asked for.'),
    });
  }
  return plan.sort((a, b) => (a.startMinute ?? DAY) - (b.startMinute ?? DAY));
}

// Just the habits for a body goal, fitted around times already in use.
export function bodyGoalHabits(p: Profile, taken: [number, number][]) {
  return buildLocalPlan({ ...p, goals: [], other: '' }, taken);
}

// Daily targets from the body goal. Only changed when a weight was given.
export function suggestedTargets(
  p: Profile,
): Partial<Pick<Settings, 'calorieGoal' | 'proteinGoal' | 'waterGoalMl' | 'streakThreshold'>> {
  const targets: ReturnType<typeof suggestedTargets> = {
    streakThreshold: p.pace === 'easy' ? 0.6 : p.pace === 'steady' ? 0.8 : 0.9,
  };
  if (!p.weightKg) return targets;
  const w = p.weightKg;
  const proteinPerKg = { build_muscle: 2, lose_fat: 1.8, fitter: 1.6, maintain: 1.4, none: 1.2 };
  const calorieShift = { build_muscle: 250, lose_fat: -450, fitter: 0, maintain: 0, none: 0 };
  // Rough maintenance estimate for a lightly active adult; a starting point, not a prescription.
  targets.calorieGoal = Math.round((w * 30 + calorieShift[p.physique]) / 50) * 50;
  targets.proteinGoal = Math.round(w * proteinPerKg[p.physique]);
  targets.waterGoalMl = Math.max(2000, Math.round((w * 35) / 250) * 250);
  return targets;
}

function clock(minute: number) {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
