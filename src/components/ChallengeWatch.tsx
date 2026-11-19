import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { Challenge, LOCK_IN_GRACE_MS } from '@/lib/challenges';
import { cancelChallengeNotice, scheduleChallengeNotice } from '@/lib/reminders';
import { useChallenges } from '@/state/useChallenges';

// Mochi's own pop-ups (like "Give up?") take focus on the web; they don't count as leaving.
let paused = false;
export async function withoutLockIn<T>(run: () => Promise<T>) {
  paused = true;
  try {
    return await run();
  } finally {
    paused = false;
  }
}

// Watches a running lock-in sprint from any screen. Leaving starts a 15-second grace: on a
// phone that's switching apps or locking it; on the web it's another tab, another window, or
// clicking into another app beside it in split view. Staying away past the grace loses it.
export function ChallengeWatch() {
  const { active, change } = useChallenges();
  const sprint = active.find((c) => c.kind === 'sprint' && c.lockIn);
  const latest = useRef<{ c?: Challenge; change: typeof change }>({ change });
  useEffect(() => {
    latest.current = { c: sprint, change };
  });
  const watching = !!sprint;

  useEffect(() => {
    if (!watching) return;

    const leave = () => {
      const cur = latest.current.c;
      if (paused || !cur || cur.awaySince) return;
      latest.current.change(cur.id, { awaySince: Date.now() });
      scheduleChallengeNotice(
        'warn',
        1,
        'Come back!',
        `${cur.title} breaks in 15 seconds unless you return to Mochi.`,
      ).catch(() => {});
    };

    const lose = (cur: Challenge) => {
      latest.current.change(cur.id, {
        status: 'lost',
        endedAt: Date.now(),
        awaySince: undefined,
        lostReason: 'Left the app',
      });
      cancelChallengeNotice('end').catch(() => {});
    };

    const back = () => {
      const cur = latest.current.c;
      if (!cur?.awaySince) return;
      cancelChallengeNotice('warn').catch(() => {});
      if (Date.now() - cur.awaySince > LOCK_IN_GRACE_MS) lose(cur);
      else latest.current.change(cur.id, { awaySince: undefined });
    };

    // Ends it on time even while still away (web timers keep running in the background).
    const timer = setInterval(() => {
      const cur = latest.current.c;
      if (cur?.awaySince && Date.now() - cur.awaySince > LOCK_IN_GRACE_MS) lose(cur);
    }, 1000);

    if (Platform.OS === 'web') {
      const onVisibility = () => (document.hidden ? leave() : document.hasFocus() && back());
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('blur', leave);
      window.addEventListener('focus', back);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('blur', leave);
        window.removeEventListener('focus', back);
      };
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') leave();
      else if (state === 'active') back();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [watching]);

  return null;
}
