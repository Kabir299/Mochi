import { isRunningInExpoGo } from 'expo';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { addDays, fromDateKey, toDateKey } from '@/lib/dates';
import { computeDayStreak, streakProgress } from '@/lib/streak';
import { colorFor } from '@/lib/wardrobe';
import { useToday } from '@/lib/useToday';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import type { MochiWidgetHandle, MochiWidgetProps, WidgetDay } from '@/widgets/types';

// Days worked out ahead, so the widget still turns over at midnight while Mochi is closed.
const DAYS_AHEAD = 7;

// Expo Go and the web don't have widgets, and loading the package there would crash.
function loadWidget(): MochiWidgetHandle | null {
  if (Platform.OS === 'web' || isRunningInExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/widgets/MochiWidget').default as MochiWidgetHandle | null;
  } catch {
    return null;
  }
}

// Keeps the home-screen widget in step with habits and settings.
export function WidgetSync() {
  const { loaded, habitsOn, isDone, dayProgress, firstDay } = useHabits();
  const settings = useSettings();
  const today = useToday();

  const progress = streakProgress(dayProgress, {
    repairedDays: settings.repairedDays,
    restDays: settings.restDays,
    threshold: settings.streakThreshold,
  });
  const days: WidgetDay[] = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const date = addDays(today, i);
    const key = toDateKey(date);
    const habits = habitsOn(key);
    // Timed tasks first, by their start.
    const left = habits
      .filter((h) => !isDone(h, key))
      .sort((a, b) => (a.startMinute ?? 1e6) - (b.startMinute ?? 1e6));
    const first = left[0];
    const next =
      habits.length === 0
        ? 'Nothing scheduled'
        : !first
          ? 'All done. Nice work!'
          : settings.widgetNames
            ? `Next: ${first.name}`
            : `${left.length} ${left.length === 1 ? 'task' : 'tasks'} left`;
    return {
      key,
      percent: Math.round((dayProgress(key) ?? 0) * 100),
      done: habits.length - left.length,
      total: habits.length,
      streak: computeDayStreak(
        firstDay,
        date,
        progress,
        settings.streakThreshold,
        settings.freezesPerMonth,
      ).current,
      next,
    };
  });
  // Before onboarding there's nothing to show.
  const props: MochiWidgetProps = {
    days: settings.onboarded ? days : [],
    petName: settings.petName,
    petColor: colorFor(settings.petColor),
  };
  const signature = JSON.stringify(props);

  useEffect(() => {
    if (!loaded || !settings.loaded) return;
    const widget = loadWidget();
    if (!widget) return;
    try {
      const latest = JSON.parse(signature) as MochiWidgetProps;
      if (Platform.OS === 'ios') {
        // One entry now and one at each midnight; the widget shows the day that matches.
        const later = latest.days.slice(1).map((d) => ({ date: fromDateKey(d.key), props: latest }));
        widget.updateTimeline([{ date: new Date(), props: latest }, ...later]);
      } else {
        widget.updateSnapshot(latest);
      }
    } catch {
      // The widget is best effort; the app works without it.
    }
  }, [signature, loaded, settings.loaded]);

  return null;
}
