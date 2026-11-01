import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as NotificationsModule from 'expo-notifications';

import { formatMinute, fromDateKey, toDateKey } from '@/lib/dates';
import type { Habit } from '@/state/habits';

const CHANNEL = 'reminders';
const NUDGE_MINUTE = 20 * 60;
const RECAP_MINUTE = 21 * 60 + 30;
// iOS keeps at most 64 scheduled notifications per app.
const MAX_SCHEDULED = 60;

// Expo Go on Android ships without some of expo-notifications' native parts and
// crashes on import, so check for them before loading anything.
export const remindersSupported =
  Platform.OS !== 'web' &&
  requireOptionalNativeModule('ExpoNotificationScheduler') !== null &&
  (Platform.OS !== 'android' || requireOptionalNativeModule('ExpoTopicSubscriptionModule') !== null);

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
  remindersOn: boolean;
  streakNudge: boolean;
  // Whether today's progress has already reached the streak threshold.
  streakSecured: boolean;
  petName: string;
  reminderLead: number;
  weeklyRecap: boolean;
  eveningRecap: boolean;
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
  return asked.granted;
}

// "5 min" / "1 h 30 min" for reminder text.
function minutesText(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

// Replaces every scheduled notification with the current plan. Cheap enough to
// call whenever habits or settings change.
export async function syncReminders(input: SyncInput) {
  if (!remindersSupported) return;
  const Notifications = await notifications();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!input.remindersOn && !input.streakNudge && !input.weeklyRecap && !input.eveningRecap) {
    return;
  }
  await ensureChannel(Notifications);
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const now = new Date();
  const todayKey = toDateKey(now);
  const requests: NotificationsModule.NotificationRequestInput[] = [];

  if (input.remindersOn) {
    for (const habit of input.habits) {
      if (habit.startMinute === null) continue;
      // Early reminders that would fall before midnight just go at the start.
      const lead = habit.startMinute >= input.reminderLead ? input.reminderLead : 0;
      const at = habit.startMinute - lead;
      const hour = Math.floor(at / 60);
      const minute = at % 60;
      const length = habit.durationMin ? ` · ${minutesText(habit.durationMin)}` : '';
      // The pet does the talking, so reminders feel like a friend, not an alarm.
      const content = {
        title: lead > 0 ? `${habit.name} in ${minutesText(lead)}` : habit.name,
        body:
          lead > 0
            ? `${input.petName}: Get ready! Starts at ${formatMinute(habit.startMinute)}${length}.`
            : `${input.petName}: It’s time! Let’s do this together${length}.`,
      };
      if (habit.repeat === 'daily') {
        requests.push({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
            channelId: CHANNEL,
          },
        });
      } else if (habit.repeat === 'days') {
        for (const day of habit.days) {
          requests.push({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              // Expo counts weekdays from 1 = Sunday.
              weekday: day + 1,
              hour,
              minute,
              channelId: CHANNEL,
            },
          });
        }
      } else if (habit.onceDay && habit.onceDay >= todayKey) {
        const date = fromDateKey(habit.onceDay);
        date.setHours(hour, minute, 0, 0);
        if (date > now) {
          requests.push({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              channelId: CHANNEL,
            },
          });
        }
      }
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

  // Every evening, a gentle invitation to wrap up the day. Tapping it opens the recap.
  if (input.eveningRecap) {
    requests.unshift({
      content: {
        title: 'How did today go?',
        body: `30 seconds with ${input.petName}: how it felt and what moves to tomorrow.`,
        data: { url: '/recap' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Math.floor(RECAP_MINUTE / 60),
        minute: RECAP_MINUTE % 60,
        channelId: CHANNEL,
      },
    });
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

// Opens the screen a tapped notification points to (its data.url), including the one
// that launched the app. Returns a function that stops listening.
export function onReminderTap(open: (url: string) => void) {
  if (!remindersSupported) return () => {};
  let stopped = false;
  let remove = () => {};
  notifications().then((Notifications) => {
    if (stopped) return;
    const handle = (response: NotificationsModule.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) open(url);
    };
    Notifications.getLastNotificationResponseAsync().then(handle);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    remove = () => sub.remove();
  });
  return () => {
    stopped = true;
    remove();
  };
}
