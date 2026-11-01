import { useEffect } from 'react';
import { router, type Href } from 'expo-router';

import { toDateKey } from '@/lib/dates';
import { onReminderTap, syncReminders } from '@/lib/reminders';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';

// Keeps scheduled notifications in step with habits and settings.
export function ReminderSync() {
  const { loaded, habits, dayProgress } = useHabits();
  const settings = useSettings();
  const streakSecured = (dayProgress(toDateKey(new Date())) ?? 0) >= settings.streakThreshold;

  // Only what affects the schedule, so ordinary taps don't reschedule.
  const signature = JSON.stringify([
    habits.map((h) => [h.id, h.name, h.repeat, h.days, h.onceDay, h.startMinute, h.durationMin]),
    settings.remindersOn,
    settings.streakNudge,
    streakSecured,
    settings.petName,
    settings.reminderLead,
    settings.weeklyRecap,
    settings.eveningRecap,
  ]);

  useEffect(() => onReminderTap((url) => router.push(url as Href)), []);

  useEffect(() => {
    if (!loaded || !settings.loaded) return;
    syncReminders({
      habits,
      remindersOn: settings.remindersOn,
      streakNudge: settings.streakNudge,
      streakSecured,
      petName: settings.petName,
      reminderLead: settings.reminderLead,
      weeklyRecap: settings.weeklyRecap,
      eveningRecap: settings.eveningRecap,
    }).catch(() => {
      // Notifications are best effort; the app works without them.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loaded, settings.loaded]);

  return null;
}
