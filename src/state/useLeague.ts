import { useEffect, useMemo } from 'react';

import {
  dayXp,
  parseLeague,
  rivals,
  settleLeague,
  standings,
  typicalWeek,
  weekElapsed,
  weekStart,
  weekXp,
  XpSource,
} from '@/lib/league';
import { addDays, fromDateKey, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/useToday';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { useChallenges } from '@/state/useChallenges';

// This week's league table and your XP, settling weeks that ended since the last look.
// `now` is passed in by screens that tick, so the rivals move while you watch.
export function useLeague(now?: Date) {
  const { habits, archivedHabits, habitProgress, dayProgress, loaded } = useHabits();
  const settings = useSettings();
  const { list: challenges } = useChallenges();
  const today = useToday();
  const at = now ?? today;
  const todayKey = toDateKey(at);
  const currentWeek = weekStart(at);
  const aiBuddy = settings.aiBuddySince ? settings.aiBuddyName : null;

  const source: XpSource = useMemo(
    () => ({
      allHabits: [...habits, ...archivedHabits],
      habitProgress,
      dayProgress,
      threshold: settings.streakThreshold,
      challenges,
    }),
    [habits, archivedHabits, habitProgress, dayProgress, settings.streakThreshold, challenges],
  );

  const stored = useMemo(
    () => parseLeague(settings.league, currentWeek),
    [settings.league, currentWeek],
  );
  const state = useMemo(
    () => settleLeague(stored, currentWeek, source, aiBuddy),
    [stored, currentWeek, source, aiBuddy],
  );

  const { update } = settings;
  const ready = loaded && settings.loaded;
  useEffect(() => {
    if (!ready) return;
    if (!settings.league || state !== stored) update({ league: JSON.stringify(state) });
  }, [ready, settings.league, state, stored, update]);

  const base = useMemo(() => typicalWeek(currentWeek, source), [currentWeek, source]);
  const youXp = weekXp(currentWeek, source, todayKey);
  const elapsed = weekElapsed(currentWeek, at);
  const table = standings(
    youXp,
    rivals(currentWeek, state.tier, base, elapsed, aiBuddy),
    settings.shareName || 'You',
  );
  const rank = table.findIndex((p) => p.you) + 1;
  const latest = state.results[state.results.length - 1];

  return {
    ready,
    tier: state.tier,
    table,
    rank,
    youXp,
    todayXp: dayXp(todayKey, source),
    endsAt: addDays(fromDateKey(currentWeek), 7),
    // Last week's result, until it has been shown.
    unseen: latest && latest.week > state.seen ? latest : null,
    markSeen: () => latest && update({ league: JSON.stringify({ ...state, seen: latest.week }) }),
  };
}
