import type { Habit } from '@/state/habits';
import { toDateKey } from '@/lib/dates';

// After this, a day with nothing done starts to make the pet sad.
const EVENING = 18 * 60;

export type Mood = 'sad' | 'okay' | 'happy' | 'ecstatic' | 'sleepy';

type Input = {
  percent: number;
  isToday: boolean;
  isFuture: boolean;
  // Minutes after midnight now; only meaningful for today.
  nowMinute: number;
  timed: Habit[];
  isDone: (habit: Habit) => boolean;
  // Every habit on this day was added that same day (e.g. right after setup).
  firstDay?: boolean;
};

// Picks the pet's mood and a short line of encouragement for the day.
export function cheer({
  percent,
  isToday,
  isFuture,
  nowMinute,
  timed,
  isDone,
  firstDay = false,
}: Input): {
  mood: Mood;
  message: string;
} {
  if (isFuture) {
    if (percent >= 100)
      return { mood: 'ecstatic', message: 'Already done? Now that’s ahead of schedule.' };
    if (percent > 0)
      return { mood: 'happy', message: 'Getting a head start. Future you says thanks.' };
    return { mood: 'sleepy', message: 'Planning ahead. Future you says thanks.' };
  }

  if (!isToday) {
    if (percent >= 100) return { mood: 'ecstatic', message: 'A perfect day. Look at that.' };
    if (percent >= 80) return { mood: 'happy', message: 'Solid day. Streak kept.' };
    return { mood: 'sad', message: 'This one slipped. Tomorrow’s a fresh start.' };
  }

  // Timed habits already done before their start time, or past their end and not done.
  const ahead = timed.filter((h) => isDone(h) && h.startMinute! > nowMinute);
  // Habits added today don't count: their time may have passed before they existed.
  const todayKey = toDateKey(new Date());
  const overdue = timed.filter(
    (h) =>
      !isDone(h) && h.startDay !== todayKey && h.startMinute! + (h.durationMin ?? 0) < nowMinute,
  );

  if (percent >= 100) return { mood: 'ecstatic', message: 'Everything done! You crushed today.' };
  if (ahead.length > 0)
    return {
      mood: 'happy',
      message: `You’re ahead of schedule. ${ahead[0].name} is already done!`,
    };
  if (percent >= 80) return { mood: 'happy', message: 'Streak secured. Keep it rolling.' };
  if (percent >= 60)
    return { mood: 'happy', message: 'Good going! You’re close to your streak goal.' };
  // Only gets sad when ignored: tasks slipping past their time, or a quiet evening.
  if (overdue.length >= 2 || (overdue.length === 1 && percent < 30))
    return {
      mood: 'sad',
      message: `${overdue[0].name} is still waiting. Your buddy misses you.`,
    };
  if (overdue.length === 1)
    return { mood: 'okay', message: `${overdue[0].name} is running late. Catch up when you can.` };
  if (percent >= 30) return { mood: 'okay', message: 'Nice start. Keep the momentum going.' };
  if (percent > 0) return { mood: 'okay', message: 'You’re off the mark. One more?' };
  if (firstDay)
    return { mood: 'happy', message: 'Your plan is ready! Tick off anything you’ve already done.' };
  if (nowMinute >= EVENING)
    return { mood: 'sad', message: 'It’s getting late. Even one small win counts.' };
  return { mood: 'okay', message: 'Fresh day. Pick the easiest one to start.' };
}
