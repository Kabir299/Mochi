import { useEffect } from 'react';

import { addDays, toDateKey } from '@/lib/dates';
import { REMINDER_DAYS } from '@/lib/reminderPlan';
import { syncReminders } from '@/lib/reminders';
import { useToday } from '@/lib/useToday';
import { isScheduled, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { useExactTiming } from '@/state/useExactTiming';

// Keeps scheduled notifications in step with habits and settings.
export function ReminderSync() {
  const { loaded, habits, dayProgress, isDone } = useHabits();
  const today = useToday();
  const settings = useSettings();
  // Alarms set before exact timing was allowed stay approximate, so reschedule when it changes.
  const exact = useExactTiming();
  // No "streak at risk" nudge on a rest day.
  const restToday = settings.restDays.split(',').includes(String(new Date().getDay()));
  const streakSecured =
    restToday || (dayProgress(toDateKey(new Date())) ?? 0) >= settings.streakThreshold;

  // Finished tasks don't get reminders, so ticking or unticking one reschedules.
  const finished: string[] = [];
  for (let offset = 0; offset < REMINDER_DAYS; offset++) {
    const day = toDateKey(addDays(today, offset));
    for (const h of habits) {
      if (h.startMinute !== null && isScheduled(h, day) && isDone(h, day)) {
        finished.push(`${h.id}:${day}`);
      }
    }
  }

  // Only what affects the schedule, so other taps don't reschedule.
  const signature = JSON.stringify([
    toDateKey(today),
    finished,
    habits.map((h) => [h.id, h.name, h.repeat, h.days, h.onceDay, h.startMinute, h.durationMin]),
    settings.remindersOn,
    settings.streakNudge,
    streakSecured,
    settings.petName,
    settings.reminderLead,
    settings.weeklyRecap,
    exact,
  ]);

  useEffect(() => {
    if (!loaded || !settings.loaded) return;
    syncReminders({
      habits,
      isScheduled,
      isDone,
      remindersOn: settings.remindersOn,
      streakNudge: settings.streakNudge,
      streakSecured,
      petName: settings.petName,
      reminderLead: settings.reminderLead,
      weeklyRecap: settings.weeklyRecap,
    }).catch(() => {
      // Notifications are best effort; the app works without them.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loaded, settings.loaded]);

  return null;
}
