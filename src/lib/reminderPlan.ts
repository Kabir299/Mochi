import { addDays, DateKey, toDateKey } from '@/lib/dates';
import type { Habit } from '@/state/habits';

// How far ahead reminders are set. The list is rebuilt whenever the app opens or a task
// changes, so someone using the app keeps a full two weeks ahead.
export const REMINDER_DAYS = 14;

export type TaskReminder = { habit: Habit; date: Date; lead: number };

// Every reminder still to come, soonest first. Each one is set for its own date rather than
// repeating, because a repeating alarm can't skip the days a task is already done.
export function upcomingReminders(input: {
  habits: Habit[];
  now: Date;
  reminderLead: number;
  isScheduled: (habit: Habit, day: DateKey) => boolean;
  isDone: (habit: Habit, day: DateKey) => boolean;
}): TaskReminder[] {
  const reminders: TaskReminder[] = [];
  for (let offset = 0; offset < REMINDER_DAYS; offset++) {
    const dayDate = addDays(input.now, offset);
    const day = toDateKey(dayDate);
    for (const habit of input.habits) {
      if (habit.startMinute === null) continue;
      if (!input.isScheduled(habit, day) || input.isDone(habit, day)) continue;
      // Early reminders that would fall before midnight just go at the start.
      const lead = habit.startMinute >= input.reminderLead ? input.reminderLead : 0;
      const at = habit.startMinute - lead;
      const date = new Date(dayDate);
      date.setHours(Math.floor(at / 60), at % 60, 0, 0);
      if (date > input.now) reminders.push({ habit, date, lead });
    }
  }
  return reminders.sort((a, b) => a.date.getTime() - b.date.getTime());
}
