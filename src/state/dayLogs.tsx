import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import * as db from '@/lib/db';
import type { DateKey } from '@/lib/dates';

// Evening recaps: one mood and one line per day.
type DayLogsContextValue = {
  loaded: boolean;
  dayLogs: db.DayLog[];
  dayLogFor: (day: DateKey) => db.DayLog | undefined;
  saveDayLog: (log: db.DayLog) => Promise<void>;
  reload: () => Promise<void>;
};

const DayLogsContext = createContext<DayLogsContextValue | null>(null);

export function DayLogsProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const [loaded, setLoaded] = useState(false);
  const [dayLogs, setDayLogs] = useState<db.DayLog[]>([]);

  const reload = useCallback(async () => {
    setDayLogs(await db.getDayLogs(database));
  }, [database]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const byDay = useMemo(() => new Map(dayLogs.map((l) => [l.day, l])), [dayLogs]);
  const dayLogFor = useCallback((day: DateKey) => byDay.get(day), [byDay]);

  const saveDayLog = useCallback(
    async (log: db.DayLog) => {
      await db.saveDayLog(database, log);
      await reload();
    },
    [database, reload],
  );

  const value = useMemo(
    () => ({ loaded, dayLogs, dayLogFor, saveDayLog, reload }),
    [loaded, dayLogs, dayLogFor, saveDayLog, reload],
  );
  return <DayLogsContext.Provider value={value}>{children}</DayLogsContext.Provider>;
}

export function useDayLogs() {
  const value = useContext(DayLogsContext);
  if (!value) throw new Error('useDayLogs must be used inside DayLogsProvider');
  return value;
}
