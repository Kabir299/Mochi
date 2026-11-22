import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { BuddySnapshot, MAX_SHARED_HABITS } from '@/lib/buddies';
import {
  BuddyLink,
  inviteCode,
  parseInviteToken,
  parseLinks,
  PulledLink,
  reconcile,
  ShareChoice,
  sharedHabits,
} from '@/lib/buddyLinks';
import {
  deriveLink,
  openSnapshot,
  randomToken,
  rpc,
  sealSnapshot,
  syncAvailable,
  SyncError,
} from '@/lib/buddySync';
import { lastNDays, toDateKey } from '@/lib/dates';
import { habitStats } from '@/lib/stats';
import { computeDayStreak, streakProgress } from '@/lib/streak';
import { useToday } from '@/lib/useToday';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';

// A tick and a quick untick shouldn't each send an update.
const SETTLE_MS = 4_000;
const RETRY_MS = 60_000;
const REFRESH_MS = 5 * 60_000;

type PulledRow = {
  link_id: string;
  joined: boolean;
  payload: string | null;
  updated_at: string | null;
};

type BuddySyncValue = {
  // Friends and open invites, without any being removed.
  links: BuddyLink[];
  // The last attempt to reach the server failed, so what's shown may be out of date.
  offline: boolean;
  createInvite: (choice: ShareChoice) => Promise<string>;
  joinInvite: (text: string, choice: ShareChoice) => Promise<void>;
  removeLink: (id: string) => void;
  setShare: (id: string, choice: ShareChoice) => void;
  syncNow: () => void;
  // Takes this phone off the server, for Delete all data.
  forgetAll: () => Promise<void>;
};

const BuddySyncContext = createContext<BuddySyncValue | null>(null);

export function BuddySyncProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const habitsState = useHabits();
  const today = useToday();

  const [links, setLinks] = useState<BuddyLink[]>([]);
  const [offline, setOffline] = useState(false);
  const linksRef = useRef<BuddyLink[]>([]);
  // What this provider last saved, to tell its own changes from a restored backup.
  const written = useRef('');
  const secret = useRef('');
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const syncQueued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Requests run later than the render that started them, so they read the newest values here.
  const latest = useRef({ settings, habitsState, today });
  useEffect(() => {
    latest.current = { settings, habitsState, today };
  });

  useEffect(() => {
    if (!settings.loaded || settings.buddyLinks === written.current) return;
    written.current = settings.buddyLinks;
    secret.current = '';
    const next = parseLinks(settings.buddyLinks);
    linksRef.current = next;
    setLinks(next);
  }, [settings.loaded, settings.buddyLinks]);

  const commit = useCallback((change: (current: BuddyLink[]) => BuddyLink[]) => {
    const next = change(linksRef.current);
    linksRef.current = next;
    setLinks(next);
    written.current = JSON.stringify(next);
    return latest.current.settings.update({ buddyLinks: written.current });
  }, []);

  // One request at a time, so an answer can't overwrite a link added while it was on its way.
  const enqueue = useCallback(<T,>(work: () => Promise<T>) => {
    const run = tail.current.then(work);
    tail.current = run.catch(() => {});
    return run;
  }, []);

  const getSecret = useCallback(async () => {
    const saved = latest.current.settings.syncSecret || secret.current;
    if (saved) return saved;
    secret.current = await randomToken();
    await latest.current.settings.update({ syncSecret: secret.current });
    return secret.current;
  }, []);

  const buildSnapshot = useCallback((link: BuddyLink): BuddySnapshot | null => {
    const { settings: s, habitsState: h, today: day } = latest.current;
    if (!s.shareName) return null;
    // One-off tasks have no track record to compare.
    const repeating = h.habits.filter((habit) => habit.repeat !== 'once');
    const stats = habitStats(day, 7, h);
    const rate = new Map(stats.map((row) => [row.habit.id, row.rate ?? 0]));
    return {
      name: s.shareName,
      day: toDateKey(day),
      streak: computeDayStreak(
        h.firstDay,
        day,
        streakProgress(h.dayProgress, {
          repairedDays: s.repairedDays,
          restDays: s.restDays,
          threshold: s.streakThreshold,
        }),
        s.streakThreshold,
        s.freezesPerMonth,
      ).current,
      week: lastNDays(day, 7).map((d) => h.dayProgress(toDateKey(d))),
      habits: sharedHabits(repeating, link)
        .slice(0, MAX_SHARED_HABITS)
        .map((habit) => ({
          name: habit.name,
          rate: rate.get(habit.id) ?? 0,
          streak: h.streakFor(habit, day),
        })),
    };
  }, []);

  const runSync = useCallback(async () => {
    const mySecret = latest.current.settings.syncSecret || secret.current;
    if (!syncAvailable || !mySecret || linksRef.current.length === 0) return;

    for (const link of linksRef.current.filter((l) => l.removing)) {
      await rpc('remove_buddy_link', { p_secret: mySecret, p_link: link.id }).catch((e) => {
        // The server doesn't know this phone any more, so the link is gone already.
        if (!(e instanceof SyncError) || e.code !== 'unknown_member') throw e;
      });
      await commit((current) => current.filter((l) => l.id !== link.id));
    }

    let rows: PulledRow[];
    try {
      rows = await rpc<PulledRow[]>('pull_buddy_updates', { p_secret: mySecret });
    } catch (e) {
      // Everything of this phone's was deleted from the server, say after months unused.
      if (!(e instanceof SyncError) || e.code !== 'unknown_member') throw e;
      rows = [];
    }
    if (!Array.isArray(rows)) throw new SyncError('offline');

    const pulled: PulledLink[] = await Promise.all(
      rows.map(async (row) => {
        const link = linksRef.current.find((l) => l.id === row.link_id);
        const isNew = !!link && !!row.payload && row.updated_at !== link.receivedAt;
        return {
          link_id: row.link_id,
          joined: row.joined,
          updated_at: row.updated_at,
          opened: isNew ? await openSnapshot(link, row.payload!) : null,
        };
      }),
    );
    await commit((current) => reconcile(current, pulled));

    for (const link of linksRef.current.filter((l) => l.joined && !l.removing)) {
      const snapshot = buildSnapshot(link);
      const json = snapshot && JSON.stringify(snapshot);
      if (!json || json === link.sent) continue;
      try {
        await rpc('push_buddy_update', {
          p_secret: mySecret,
          p_link: link.id,
          p_payload: await sealSnapshot(link, json),
        });
      } catch (e) {
        // They removed you a moment ago; the next look at the server drops the link.
        if (e instanceof SyncError && e.code === 'link_gone') continue;
        throw e;
      }
      await commit((current) => current.map((l) => (l.id === link.id ? { ...l, sent: json } : l)));
    }
  }, [buildSnapshot, commit]);

  const syncNow = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (syncQueued.current) return;
    syncQueued.current = true;
    enqueue(async () => {
      syncQueued.current = false;
      try {
        await runSync();
        setOffline(false);
      } catch {
        // Nothing is lost: the newest progress is worked out again on the next try.
        setOffline(true);
      }
    });
  }, [enqueue, runSync]);

  const hasLinks = links.length > 0;
  const { habits, dayProgress } = habitsState;
  const todayKey = toDateKey(today);

  // Progress, or the name that goes with it, changed.
  useEffect(() => {
    if (!hasLinks) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(syncNow, SETTLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [hasLinks, habits, dayProgress, todayKey, settings.shareName, syncNow]);

  useEffect(() => {
    if (!hasLinks) return;
    const subscription = AppState.addEventListener('change', (state) => {
      // Going to the background sends a waiting tick now, before the phone pauses the app.
      if (state === 'active' || (state === 'background' && timer.current)) syncNow();
    });
    const refresh = setInterval(syncNow, REFRESH_MS);
    return () => {
      subscription.remove();
      clearInterval(refresh);
    };
  }, [hasLinks, syncNow]);

  useEffect(() => {
    if (!offline || !hasLinks) return;
    const retry = setInterval(syncNow, RETRY_MS);
    return () => clearInterval(retry);
  }, [offline, hasLinks, syncNow]);

  const createInvite = useCallback(
    (choice: ShareChoice) =>
      enqueue(async () => {
        const mySecret = await getSecret();
        const token = await randomToken();
        const { id, key } = await deriveLink(token);
        await rpc('create_buddy_invite', { p_secret: mySecret, p_link: id });
        const code = inviteCode(token);
        await commit((current) => [
          ...current,
          {
            ...choice,
            id,
            key,
            role: 'inviter',
            joined: false,
            code,
            buddy: null,
            receivedAt: null,
            sent: null,
            removing: false,
          },
        ]);
        return code;
      }),
    [commit, enqueue, getSecret],
  );

  const joinInvite = useCallback(
    (text: string, choice: ShareChoice) =>
      enqueue(async () => {
        const token = parseInviteToken(text);
        if (!token) throw new SyncError('invite_invalid');
        const { id, key } = await deriveLink(token);
        const existing = linksRef.current.find((l) => l.id === id);
        if (existing) throw new SyncError(existing.joined ? 'already_linked' : 'own_invite');
        await rpc('accept_buddy_invite', { p_secret: await getSecret(), p_link: id });
        await commit((current) => [
          ...current,
          {
            ...choice,
            id,
            key,
            role: 'joiner',
            joined: true,
            code: null,
            buddy: null,
            receivedAt: null,
            sent: null,
            removing: false,
          },
        ]);
      }).then(syncNow),
    [commit, enqueue, getSecret, syncNow],
  );

  // Hidden at once and removed from the server as soon as it can be reached, so a friend can
  // never keep seeing your progress because you happened to be offline.
  const removeLink = useCallback(
    (id: string) => {
      commit((current) => current.map((l) => (l.id === id ? { ...l, removing: true } : l)));
      syncNow();
    },
    [commit, syncNow],
  );

  const setShare = useCallback(
    (id: string, choice: ShareChoice) => {
      commit((current) => current.map((l) => (l.id === id ? { ...l, ...choice } : l)));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(syncNow, SETTLE_MS);
    },
    [commit, syncNow],
  );

  const forgetAll = useCallback(
    () =>
      enqueue(async () => {
        const mySecret = latest.current.settings.syncSecret || secret.current;
        if (syncAvailable && mySecret) {
          // Best effort: if this fails, the server tidies it away after 6 months unused.
          await rpc('delete_buddy_member', { p_secret: mySecret }).catch(() => {});
        }
        secret.current = '';
        await commit(() => []);
      }),
    [commit, enqueue],
  );

  const value = useMemo(
    () => ({
      links: links.filter((l) => !l.removing),
      offline,
      createInvite,
      joinInvite,
      removeLink,
      setShare,
      syncNow,
      forgetAll,
    }),
    [links, offline, createInvite, joinInvite, removeLink, setShare, syncNow, forgetAll],
  );

  return <BuddySyncContext.Provider value={value}>{children}</BuddySyncContext.Provider>;
}

export function useBuddySync() {
  const ctx = useContext(BuddySyncContext);
  if (!ctx) throw new Error('useBuddySync must be used inside BuddySyncProvider');
  return ctx;
}
