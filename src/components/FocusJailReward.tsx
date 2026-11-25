import { useEffect, useRef } from 'react';

import { useHabits } from '@/state/habits';
import { useChallenges } from '@/state/useChallenges';

// A focus session served in Phone Jail ticks its task off and logs the time once it's won,
// whichever screen is open and even if it was won while the app was closed.
export function FocusJailReward() {
  const { loaded: ready, list, change } = useChallenges();
  const { loaded, getHabit, addFocusTime, countFor, checkIn } = useHabits();
  // A save made elsewhere at the same moment can undo `claimed`; this stops a second reward.
  const paid = useRef(new Set<string>());

  const won = list.find((c) => c.status === 'won' && c.focus && !c.claimed);
  useEffect(() => {
    if (!ready || !loaded || !won?.focus) return;
    change(won.id, { claimed: true });
    if (paid.current.has(won.id)) return;
    paid.current.add(won.id);
    const { habitId, day } = won.focus;
    const habit = getHabit(habitId);
    if (!habit) return;
    addFocusTime(habit, day, won.minutes ?? 0).catch(() => {});
    if (countFor(habit.id, day) < habit.target) checkIn(habit, day);
  }, [ready, loaded, won, change, getHabit, addFocusTime, countFor, checkIn]);

  return null;
}
