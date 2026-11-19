import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as NotificationsModule from 'expo-notifications';

import { confirmAction } from '@/lib/confirm';
import { DateKey, formatMinute } from '@/lib/dates';
import { upcomingReminders } from '@/lib/reminderPlan';
import type { Habit } from '@/state/habits';

const CHANNEL = 'reminders';
const NUDGE_MINUTE = 20 * 60;
// iOS keeps at most 64 scheduled notifications per app.
const MAX_SCHEDULED = 60;
// Survives the reschedule below, so ticking a task doesn't silence a running focus timer.
const FOCUS_END_ID = 'focus-end';

// Expo Go on Android ships without some of expo-notifications' native parts and
// crashes on import, so check for them before loading anything.
export const remindersSupported =
  Platform.OS !== 'web' &&
  requireOptionalNativeModule('ExpoNotificationScheduler') !== null &&
  (Platform.OS !== 'android' ||
    requireOptionalNativeModule('ExpoTopicSubscriptionModule') !== null);

let loaded: typeof NotificationsModule | null = null;

// Imported lazily so unsupported environments never evaluate the module.
async function notifications() {
  if (loaded) return loaded;
  loaded = await import('expo-notifications');
  loaded.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  return loaded;
}

type SyncInput = {
  habits: Habit[];
  isScheduled: (habit: Habit, day: DateKey) => boolean;
  isDone: (habit: Habit, day: DateKey) => boolean;
  remindersOn: boolean;
  streakNudge: boolean;
  // Whether today's progress has already reached the streak threshold.
  streakSecured: boolean;
  petName: string;
  reminderLead: number;
  weeklyRecap: boolean;
};

async function ensureChannel(Notifications: typeof NotificationsModule) {
  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

// Shows the system prompt. Only called from a tap (setup or Settings), so the
// app never asks out of the blue. Resolves to whether notifications are allowed.
export async function requestReminderPermission() {
  if (!remindersSupported) return false;
  const Notifications = await notifications();
  await ensureChannel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  if (asked.granted && !(await exactTimingAllowed())) {
    const ok = await confirmAction(
      'Get reminders on time?',
      'To save battery, Android can send reminders up to half an hour late. Allow Mochi to send them at the exact time by turning on “Alarms & reminders” on the next screen.',
      'Allow',
    );
    if (ok) await allowExactTiming();
  }
  return asked.granted;
}

// Android 12+ batches ordinary alarms to save battery, which can make a reminder 20+
// minutes late. On-time reminders need "Alarms & reminders", which the person allows in
// system settings (Android 14+ starts with it off). Always true on iOS.
export async function exactTimingAllowed() {
  if (!remindersSupported || Platform.OS !== 'android') return true;
  const Notifications = await notifications();
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

// Opens the system screen to allow it; resolves when the person comes back.
export async function allowExactTiming() {
  if (!remindersSupported || Platform.OS !== 'android') return true;
  const Notifications = await notifications();
  try {
    return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

// Rings when a focus session ends, even with the phone locked or the app closed.
// Returns an id for cancelling it on pause, or null when notifications aren't allowed.
export async function scheduleFocusEnd(seconds: number, title: string, body: string) {
  if (!remindersSupported) return null;
  const Notifications = await notifications();
  if (!(await Notifications.getPermissionsAsync()).granted) return null;
  await ensureChannel(Notifications);
  return Notifications.scheduleNotificationAsync({
    identifier: FOCUS_END_ID,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(seconds)),
      channelId: CHANNEL,
    },
  });
}

export async function cancelFocusEnd(id: string | null) {
  if (!id || !remindersSupported) return;
  const Notifications = await notifications();
  await Notifications.cancelScheduledNotificationAsync(id);
}

// Challenge notices: "end" rings when a sprint is won, "warn" right after leaving a lock-in.
// Fixed ids, so a new one replaces the old and they can be cancelled without storing anything.
export async function scheduleChallengeNotice(
  kind: 'end' | 'warn',
  seconds: number,
  title: string,
  body: string,
) {
  if (!remindersSupported) return;
  const Notifications = await notifications();
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await ensureChannel(Notifications);
  await Notifications.scheduleNotificationAsync({
    identifier: `challenge-${kind}`,
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(seconds)),
      channelId: CHANNEL,
    },
  });
}

export async function cancelChallengeNotice(kind: 'end' | 'warn') {
  if (!remindersSupported) return;
  const Notifications = await notifications();
  await Notifications.cancelScheduledNotificationAsync(`challenge-${kind}`);
}

// "5 min" / "1 h 30 min" for reminder text.
function minutesText(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

let syncing = false;
let queued: SyncInput | null = null;

// Replaces every scheduled reminder with the current plan. Cheap enough to call whenever
// habits or settings change. Ticks can come quickly, so runs go one at a time and only
// the newest waiting plan is applied; overlapping runs would double up reminders.
export async function syncReminders(input: SyncInput) {
  if (!remindersSupported) return;
  queued = input;
  if (syncing) return;
  syncing = true;
  try {
    while (queued) {
      const next = queued;
      queued = null;
      await applyReminders(next);
    }
  } finally {
    syncing = false;
  }
}

async function applyReminders(input: SyncInput) {
  const Notifications = await notifications();
  for (const scheduled of await Notifications.getAllScheduledNotificationsAsync()) {
    if (scheduled.identifier !== FOCUS_END_ID) {
      await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
    }
  }
  if (!input.remindersOn && !input.streakNudge && !input.weeklyRecap) return;
  await ensureChannel(Notifications);
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const now = new Date();
  const requests: NotificationsModule.NotificationRequestInput[] = [];

  if (input.remindersOn) {
    for (const { habit, date, lead } of upcomingReminders({ ...input, now })) {
      const length = habit.durationMin ? ` · ${minutesText(habit.durationMin)}` : '';
      // The pet does the talking, so reminders feel like a friend, not an alarm.
      requests.push({
        content: {
          title: lead > 0 ? `${habit.name} in ${minutesText(lead)}` : habit.name,
          body:
            lead > 0
              ? `${input.petName}: Get ready! Starts at ${formatMinute(habit.startMinute!)}${length}.`
              : `${input.petName}: It’s time! Let’s do this together${length}.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: CHANNEL,
        },
      });
    }
  }

  // One evening nudge, only when today's streak isn't secured yet.
  if (input.streakNudge && !input.streakSecured) {
    const date = new Date(now);
    date.setHours(Math.floor(NUDGE_MINUTE / 60), NUDGE_MINUTE % 60, 0, 0);
    if (date > now) {
      requests.unshift({
        content: {
          title: 'Your streak is at risk',
          body: `${input.petName} is waiting. A couple of quick check-ins will keep it going.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          channelId: CHANNEL,
        },
      });
    }
  }

  // Sunday 7 PM, a nudge to look back at the week.
  if (input.weeklyRecap) {
    requests.unshift({
      content: {
        title: `Your week with ${input.petName}`,
        body: 'See how your week went and set up the next one. Open Progress.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1,
        hour: 19,
        minute: 0,
        channelId: CHANNEL,
      },
    });
  }

  for (const request of requests.slice(0, MAX_SCHEDULED)) {
    await Notifications.scheduleNotificationAsync(request);
  }
}
