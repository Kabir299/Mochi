import { useCallback, useEffect, useMemo } from 'react';

import { Challenge, parseChallenges, settle, statsOf } from '@/lib/challenges';
import { useSettings } from '@/state/settings';

// Reads and saves challenges, settling any that ended while the app wasn't looking.
export function useChallenges() {
  const settings = useSettings();
  const { update, loaded } = settings;
  const raw = settings.challenges;
  const list = useMemo(() => parseChallenges(raw), [raw]);

  const save = useCallback(
    (next: Challenge[]) => update({ challenges: JSON.stringify(next) }),
    [update],
  );

  const change = useCallback(
    (id: string, patch: Partial<Challenge>) =>
      save(parseChallenges(raw).map((c) => (c.id === id ? { ...c, ...patch } : c))),
    [raw, save],
  );

  useEffect(() => {
    if (!loaded) return;
    const settled = settle(list);
    if (settled.some((c, i) => c !== list[i])) save(settled);
  }, [loaded, list, save]);

  const active = list.filter((c) => c.status === 'active');
  const history = list
    .filter((c) => c.status !== 'active')
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

  return {
    loaded,
    list,
    active,
    history,
    stats: statsOf(list),
    add: (c: Challenge) => save([...list, c]),
    change,
    remove: (id: string) => save(list.filter((c) => c.id !== id)),
  };
}
