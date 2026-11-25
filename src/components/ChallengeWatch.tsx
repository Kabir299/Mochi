import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { awayLimit, Challenge } from '@/lib/challenges';
import { cancelChallengeNotice, scheduleChallengeNotice } from '@/lib/reminders';
import { useChallenges } from '@/state/useChallenges';
import { inCall } from '../../modules/call-state';

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
// A phone call is excused: the 15 seconds start once it's over.
export function ChallengeWatch() {
  const { active, change } = useChallenges();
  const sprint = active.find((c) => c.kind === 'sprint' && c.lockIn);
  const latest = useRef<{ c?: Challenge; change: typeof change }>({ change });
  useEffect(() => {
    latest.current = { c: sprint, change };
  });
  const watching = !!sprint;
  // Kept here as well as in the saved challenge: a background tab can be paused before the
  // saved change has been drawn, so the screen's copy may not know they left yet.
  // null: not known here (e.g. after a reload), so the saved copy decides; 0: here.
  const awayAt = useRef<number | null>(null);
  // Whether this time away is for a call; null like awayAt.
  const awayCall = useRef<boolean | null>(null);

  useEffect(() => {
    if (!watching) return;

    const warn = (cur: Challenge) =>
      scheduleChallengeNotice(
        'warn',
        1,
        'Come back!',
        `${cur.title} breaks in 15 seconds unless you return to Mochi.`,
      ).catch(() => {});

    const since = () =>
      awayAt.current === null ? latest.current.c?.awaySince : awayAt.current || undefined;
    const forCall = () =>
      awayCall.current === null ? !!latest.current.c?.awayCall : awayCall.current;
    const tooLong = (start: number) => Date.now() - start > awayLimit(forCall());

    const leave = () => {
      const cur = latest.current.c;
      if (paused || !cur || awayAt.current) return;
      awayAt.current = (awayAt.current === null && cur.awaySince) || Date.now();
      awayCall.current = (awayCall.current === null && cur.awayCall) || inCall();
      latest.current.change(cur.id, {
        awaySince: awayAt.current,
        awayCall: awayCall.current || undefined,
      });
      if (!awayCall.current) warn(cur);
    };

    const lose = (cur: Challenge) => {
      awayAt.current = 0;
      awayCall.current = false;
      latest.current.change(cur.id, {
        status: 'lost',
        endedAt: Date.now(),
        awaySince: undefined,
        awayCall: undefined,
        lostReason: 'Left the app',
      });
      cancelChallengeNotice('end').catch(() => {});
    };

    const back = () => {
      const cur = latest.current.c;
      const start = since();
      if (!cur || !start) return;
      cancelChallengeNotice('warn').catch(() => {});
      // Still on the call, however long it has been, is never too long.
      if (!inCall() && tooLong(start)) {
        lose(cur);
        return;
      }
      awayAt.current = 0;
      awayCall.current = false;
      latest.current.change(cur.id, { awaySince: undefined, awayCall: undefined });
    };

    // Ends it on time even while still away (web timers keep running in the background).
    const timer = setInterval(() => {
      const cur = latest.current.c;
      const start = since();
      if (!cur || !start) return;
      const calling = inCall();
      if (calling) {
        // A call that came in (or was made) within the grace.
        if (!forCall() && !tooLong(start)) {
          awayCall.current = true;
          awayAt.current = start;
          cancelChallengeNotice('warn').catch(() => {});
          latest.current.change(cur.id, { awaySince: start, awayCall: true });
        }
        if (forCall()) return;
      }
      if (tooLong(start)) {
        lose(cur);
      } else if (forCall()) {
        // The call is over, so the 15 seconds to come back start now.
        awayCall.current = false;
        awayAt.current = Date.now();
        latest.current.change(cur.id, { awaySince: awayAt.current, awayCall: undefined });
        warn(cur);
      }
    }, 1000);

    if (Platform.OS === 'web') {
      // Coming back to the tab counts as back even before the window regains focus; phones'
      // browsers often never send that focus event.
      const onVisibility = () => (document.hidden ? leave() : back());
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

    // Opened again after being closed: there's no "active" event for that.
    if (AppState.currentState === 'active') back();
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
