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
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';

import {
  accountAvailable,
  clearMark,
  clearSession,
  finishSignIn,
  loadMark,
  loadSession,
  refreshSession,
  saveMark,
  Session,
  signOut as signOutOnServer,
  startGoogleSignIn,
  SyncMark,
} from '@/lib/account';
import { rpc, SyncError } from '@/lib/buddySync';
import { confirmDestructive } from '@/lib/confirm';
import { parseBackup, syncSnapshot } from '@/lib/db';
import { replaceAll } from '@/lib/snapshots';
import { useHabits } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';

// A tick and a quick untick shouldn't each be sent.
const SETTLE_MS = 3_000;
// How often an open app looks for changes made on another device.
const CHECK_MS = 30_000;

type Pulled = { version: number; data: string | null; updated_at: string };

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'update_needed';

type AccountValue = {
  // False in builds without the server set up; the sign-in option is hidden.
  available: boolean;
  account: { email: string; name: string } | null;
  status: SyncStatus;
  lastSynced: number | null;
  signIn: () => Promise<void>;
  // Finishes a sign-in with the one-time code Google sent back.
  completeSignIn: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Removes the account and its synced copy from the server. This device keeps its data.
  deleteAccount: () => Promise<void>;
  syncNow: () => void;
};

const AccountContext = createContext<AccountValue | null>(null);

const fingerprint = (text: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// How much a saved copy holds, for choosing between two of them.
function summarise(data: string) {
  let habits = 0;
  let ticks = 0;
  let records = 0;
  try {
    const d = JSON.parse(data) as Record<string, unknown[] | undefined>;
    habits = d.habits?.length ?? 0;
    ticks = d.logs?.length ?? 0;
    records =
      habits + ticks + (d.water?.length ?? 0) + (d.food?.length ?? 0) + (d.gym?.length ?? 0);
  } catch {
    // Unreadable counts as nothing.
  }
  return { records, text: `${plural(habits, 'habit')}, ${plural(ticks, 'check-in')}` };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const settings = useSettings();
  const habitsState = useHabits();
  const nutrition = useNutrition();

  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>('off');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledCodes = useRef(new Set<string>());

  // Syncs run later than the render that started them, so they read the newest values here.
  const latest = useRef({ settings, habitsState, nutrition });
  useEffect(() => {
    latest.current = { settings, habitsState, nutrition };
  });

  const keep = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    if (!next) setStatus('off');
  }, []);

  useEffect(() => {
    if (accountAvailable) loadSession().then((saved) => saved && keep(saved));
  }, [keep]);

  // One at a time, so two syncs can't both think they hold the newest copy.
  const enqueue = useCallback(<T,>(work: () => Promise<T>) => {
    const run = tail.current.then(work);
    tail.current = run.catch(() => {});
    return run;
  }, []);

  const forget = useCallback(async () => {
    await Promise.all([clearSession(), clearMark()]);
    keep(null);
  }, [keep]);

  // Replaces what's on this device with the account's copy.
  const apply = useCallback(
    async (remote: Pulled, mark: SyncMark) => {
      const backup = parseBackup(remote.data ?? '');
      await replaceAll(database, backup, 'before_sync');
      const { settings: s, habitsState: h, nutrition: n } = latest.current;
      await Promise.all([h.reload(), n.reload(), s.reload()]);
      // Fingerprinted from what was really stored, so nothing looks changed afterwards.
      const hash = await fingerprint(await syncSnapshot(database));
      await saveMark({ ...mark, version: remote.version, hash, dirtySince: null });
    },
    [database],
  );

  const runSync = useCallback(async (): Promise<void> => {
    let current = sessionRef.current;
    if (!current || !latest.current.settings.loaded) return;
    if (current.expiresAt < Date.now() + 60_000) {
      current = await refreshSession(current);
      // Signed out while the new pass was on its way.
      if (!sessionRef.current) return;
      keep(current);
    }
    const token = current.accessToken;

    let mark = await loadMark(current.userId);
    const local = await syncSnapshot(database);
    const localHash = await fingerprint(local);
    const dirty = localHash !== mark.hash;
    if (dirty && mark.version > 0 && mark.dirtySince === null) {
      mark = { ...mark, dirtySince: Date.now() };
      await saveMark(mark);
    }

    const push = async (base: number, force = false) => {
      const version = await rpc<number>(
        'sync_push',
        { p_data: local, p_base: base, p_force: force },
        token,
      );
      await saveMark({ ...mark, version, hash: localHash, dirtySince: null });
    };

    const rows = await rpc<Pulled[]>('sync_pull', { p_have: mark.version }, token);
    const remote = Array.isArray(rows) ? rows[0] : undefined;

    if (!remote) {
      // Nothing saved to this account yet: this device's data becomes the first copy.
      await push(0);
    } else if (mark.version === 0) {
      // First sync on this device, and the account already has data. What's here is read
      // from the database itself: right after opening the app (Android often restarts it
      // during Google sign-in) the screens haven't loaded yet and look empty, which once
      // replaced a phone's whole history without asking.
      const here = summarise(local);
      const there = summarise(remote.data ?? '');
      const counts = `This device: ${here.text}.\nYour account: ${there.text}.`;
      if (
        here.records === 0 ||
        (await confirmDestructive(
          'Use your account’s data?',
          `${counts}\n\nUsing the account’s data replaces what’s on this device. A copy of this device’s data is kept in Settings → Earlier copies.`,
          'Use account data',
        ))
      ) {
        await apply(remote, mark);
      } else if (
        await confirmDestructive(
          'Keep this device’s data instead?',
          `${counts}\n\nThis device’s data replaces what’s saved in your account, on every device signed in to it.`,
          'Keep this device’s',
        )
      ) {
        await push(remote.version, true);
      } else {
        // Neither: nothing is changed, and they stay signed out.
        await signOutOnServer(current);
        await forget();
        return;
      }
    } else if (remote.version !== mark.version) {
      // Another device saved since this one last synced. If this one changed too, the most
      // recent change wins.
      const remoteAt = Date.parse(remote.updated_at) || 0;
      if (!dirty || remoteAt >= (mark.dirtySince ?? 0)) await apply(remote, mark);
      else await push(remote.version, true);
    } else if (dirty) {
      await push(mark.version);
    }
    setLastSynced(Date.now());
  }, [apply, database, forget, keep]);

  const syncNow = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!sessionRef.current || queued.current) return;
    queued.current = true;
    return enqueue(async () => {
      queued.current = false;
      if (!sessionRef.current) return;
      setStatus((s) => (s === 'synced' ? s : 'syncing'));
      try {
        await runSync().catch((e) => {
          // Another device saved in the moment between looking and saving: look again, once.
          if (e instanceof SyncError && e.code === 'stale') return runSync();
          throw e;
        });
        if (sessionRef.current) setStatus('synced');
      } catch (e) {
        if (e instanceof SyncError && (e.code === 'signed_out' || e.code === 'not_signed_in')) {
          // The account was deleted or signed out everywhere. Data here is untouched.
          await forget();
        } else if (e instanceof SyncError) {
          setStatus('offline');
        } else {
          // The account's copy was made by a newer version of the app than this one.
          setStatus('update_needed');
        }
      }
    });
  }, [enqueue, forget, runSync]);

  const signedIn = session !== null;
  const { habits, dayProgress } = habitsState;
  const { water, food, gym } = nutrition;

  // Opening the app, or signing in: get in step straight away.
  const ready = signedIn && settings.loaded;
  useEffect(() => {
    if (ready) syncNow();
  }, [ready, syncNow]);

  // Something changed here: save it once things settle.
  useEffect(() => {
    if (!signedIn || !settings.loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(syncNow, SETTLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [signedIn, settings, habits, dayProgress, water, food, gym, syncNow]);

  // Changes from other devices: looked for when the app is opened, and regularly while it's open.
  useEffect(() => {
    if (!signedIn) return;
    const subscription = AppState.addEventListener('change', (state) => {
      // Going to the background saves a waiting change now, before the phone pauses the app.
      if (state === 'active' || (state === 'background' && timer.current)) syncNow();
    });
    const check = setInterval(() => {
      if (AppState.currentState === 'active') syncNow();
    }, CHECK_MS);
    return () => {
      subscription.remove();
      clearInterval(check);
    };
  }, [signedIn, syncNow]);

  const completeSignIn = useCallback(
    async (code: string) => {
      // The code works once, and can arrive both from the sign-in page and as a link.
      if (handledCodes.current.has(code)) return;
      handledCodes.current.add(code);
      keep(await finishSignIn(code));
      await syncNow();
    },
    [keep, syncNow],
  );

  const signIn = useCallback(async () => {
    const code = await startGoogleSignIn();
    if (code) await completeSignIn(code);
  }, [completeSignIn]);

  const signOut = useCallback(
    () =>
      enqueue(async () => {
        await signOutOnServer(sessionRef.current);
        await forget();
      }),
    [enqueue, forget],
  );

  const deleteAccount = useCallback(
    () =>
      enqueue(async () => {
        let current = sessionRef.current;
        if (!current) return;
        if (current.expiresAt < Date.now() + 60_000) current = await refreshSession(current);
        await rpc('delete_account', {}, current.accessToken);
        await forget();
      }),
    [enqueue, forget],
  );

  const value = useMemo<AccountValue>(
    () => ({
      available: accountAvailable,
      account: session ? { email: session.email, name: session.name } : null,
      status,
      lastSynced,
      signIn,
      completeSignIn,
      signOut,
      deleteAccount,
      syncNow: () => {
        syncNow();
      },
    }),
    [session, status, lastSynced, signIn, completeSignIn, signOut, deleteAccount, syncNow],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
