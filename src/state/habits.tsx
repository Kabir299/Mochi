import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import * as db from '@/lib/db';
import { addDays, DateKey, fromDateKey, sqliteUtcToDateKey, toDateKey } from '@/lib/dates';

export type IconName = keyof typeof Ionicons.glyphMap;
export type Repeat = db.Repeat;

export type Habit = {
  id: number;
  name: string;
  icon: IconName;
  // 1 for a yes/no habit; more for counted habits like "8 glasses".
  target: number;
  unit: string | null;
  repeat: Repeat;
  // How much the habit counts toward the daily %: 1 low, 2 medium, 3 high.
  weight: number;
  // Minutes after midnight the habit is planned for; null means any time.
  startMinute: number | null;
  // Planned length in minutes; null when untimed.
  durationMin: number | null;
  // Weekdays (0 = Sunday) when repeat is 'days'.
  days: number[];
  // The one day a 'once' task is due.
  onceDay: DateKey | null;
  // Hidden from Today and stats but kept with its history.
  archived: boolean;
  sortOrder: number;
  // Local day the habit was created; earlier days don't count against it.
  startDay: DateKey;
};
// startDay is optional when creating: it defaults to today.
export type HabitInput = Omit<Habit, 'id' | 'startDay' | 'archived' | 'sortOrder'> & {
  startDay?: DateKey;
};

export type DayEntry = { note: string | null; mood: number | null; spentMin: number };

// habitId -> dateKey -> count done that day
type Logs = Record<number, Record<DateKey, number>>;
// habitId -> dateKey -> note, mood and focus time for that day
type Entries = Record<number, Record<DateKey, DayEntry>>;
const EMPTY_ENTRY: DayEntry = { note: null, mood: null, spentMin: 0 };

// Longest streak we bother counting back; keeps the loop bounded.
const MAX_STREAK_LOOKBACK = 3650;

type HabitsContextValue = {
  loaded: boolean;
  habits: Habit[];
  getHabit: (id: number) => Habit | undefined;
  isScheduled: (habit: Habit, day: DateKey) => boolean;
  habitsOn: (day: DateKey) => Habit[];
  archivedHabits: Habit[];
  // Lifetime totals for badges.
  totals: { checkIns: number; focusMinutes: number; notes: number };
  entryFor: (habitId: number, day: DateKey) => DayEntry;
  setNote: (habit: Habit, day: DateKey, note: string | null, mood: number | null) => Promise<void>;
  addFocusTime: (habit: Habit, day: DateKey, minutes: number) => Promise<void>;
  archiveHabit: (id: number, archived: boolean) => Promise<void>;
  moveOnceTask: (id: number, day: DateKey) => Promise<void>;
  // Swaps a habit with its neighbour among the given list.
  moveHabit: (id: number, direction: -1 | 1, within: Habit[]) => Promise<void>;
  reload: () => Promise<void>;
  // Earliest day any habit was tracked, or null with no habits.
  firstDay: DateKey | null;
  countFor: (habitId: number, day: DateKey) => number;
  isDone: (habit: Habit, day: DateKey) => boolean;
  habitProgress: (habit: Habit, day: DateKey) => number;
  dayProgress: (day: DateKey) => number | null;
  streakFor: (habit: Habit, today: Date) => number;
  checkIn: (habit: Habit, day: DateKey) => void;
  decrement: (habit: Habit, day: DateKey) => void;
  // Sets an exact count, e.g. to undo a tap.
  setCountFor: (habit: Habit, day: DateKey, count: number) => void;
  // Adds one, stopping at the goal (unlike checkIn, which wraps back to zero).
  increment: (habit: Habit, day: DateKey) => void;
  addHabit: (input: HabitInput) => Promise<void>;
  editHabit: (id: number, input: HabitInput) => Promise<void>;
  removeHabit: (id: number) => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue | null>(null);

function fromRecord({
  created_at,
  days,
  once_day,
  start_day,
  start_minute,
  duration_min,
  archived,
  sort_order,
  ...row
}: db.HabitRecord): Habit {
  return {
    ...row,
    archived: archived === 1,
    sortOrder: sort_order,
    startMinute: start_minute,
    durationMin: duration_min,
    icon: row.icon as IconName,
    days: days ? days.split(',').map(Number) : [],
    onceDay: once_day,
    startDay: start_day ?? sqliteUtcToDateKey(created_at),
  };
}

function toRecordInput(input: HabitInput): db.HabitInput {
  return {
    name: input.name,
    icon: input.icon,
    target: input.target,
    unit: input.unit,
    repeat: input.repeat,
    weight: input.weight,
    start_minute: input.startMinute,
    // Kept for any-time tasks too, so Plan my day knows how long they take.
    duration_min: input.durationMin,
    days: input.repeat === 'days' ? input.days.join(',') : null,
    once_day: input.repeat === 'once' ? input.onceDay : null,
    start_day: input.startDay ?? null,
  };
}

export function isScheduled(habit: Habit, day: DateKey) {
  switch (habit.repeat) {
    case 'once':
      return day === habit.onceDay;
    case 'days':
      return day >= habit.startDay && habit.days.includes(fromDateKey(day).getDay());
    default:
      return day >= habit.startDay;
  }
}

// State lives in memory for instant taps; every change is also written to
// the on-device database so it survives restarts.
export function HabitsProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const [loaded, setLoaded] = useState(false);
  const [allHabits, setAllHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Logs>({});
  const [entries, setEntries] = useState<Entries>({});

  const reload = useCallback(async () => {
    const [habitRows, logRows] = await Promise.all([db.getHabits(database), db.getLogs(database)]);
    const nextLogs: Logs = {};
    const nextEntries: Entries = {};
    for (const row of logRows) {
      (nextLogs[row.habit_id] ??= {})[row.day] = row.count;
      if (row.note || row.mood || row.spent_min) {
        (nextEntries[row.habit_id] ??= {})[row.day] = {
          note: row.note,
          mood: row.mood,
          spentMin: row.spent_min ?? 0,
        };
      }
    }
    setAllHabits(habitRows.map(fromRecord));
    setLogs(nextLogs);
    setEntries(nextEntries);
  }, [database]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // New installs get their first habits from onboarding (or the starter set if skipped).
      if (cancelled) return;
      await reload();
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [database, reload]);

  // Archived habits keep their history but drop out of everything else.
  const habits = useMemo(() => allHabits.filter((h) => !h.archived), [allHabits]);
  const archivedHabits = useMemo(() => allHabits.filter((h) => h.archived), [allHabits]);

  const getHabit = useCallback((id: number) => allHabits.find((h) => h.id === id), [allHabits]);

  const totals = useMemo(() => {
    let checkIns = 0;
    for (const days of Object.values(logs)) for (const c of Object.values(days)) checkIns += c;
    let focusMinutes = 0;
    let notes = 0;
    for (const days of Object.values(entries)) {
      for (const e of Object.values(days)) {
        focusMinutes += e.spentMin;
        if (e.note) notes++;
      }
    }
    return { checkIns, focusMinutes, notes };
  }, [logs, entries]);

  const entryFor = useCallback(
    (habitId: number, day: DateKey) => entries[habitId]?.[day] ?? EMPTY_ENTRY,
    [entries],
  );

  const firstDay = useMemo(
    () =>
      habits.reduce<DateKey | null>((min, h) => {
        const start =
          h.repeat === 'once' && h.onceDay && h.onceDay < h.startDay ? h.onceDay : h.startDay;
        return min === null || start < min ? start : min;
      }, null),
    [habits],
  );

  const habitsOn = useCallback(
    (day: DateKey) => habits.filter((h) => isScheduled(h, day)),
    [habits],
  );

  const countFor = useCallback(
    (habitId: number, day: DateKey) => logs[habitId]?.[day] ?? 0,
    [logs],
  );

  const isDone = useCallback(
    (habit: Habit, day: DateKey) => countFor(habit.id, day) >= habit.target,
    [countFor],
  );

  // 0..1, so a counted habit at 5 of 8 contributes 62.5%.
  const habitProgress = useCallback(
    (habit: Habit, day: DateKey) => Math.min(countFor(habit.id, day) / habit.target, 1),
    [countFor],
  );

  // Weighted average progress across habits scheduled that day, so a high-worth
  // habit counts three times a low one. Null when nothing was scheduled.
  const dayProgress = useCallback(
    (day: DateKey) => {
      const active = habitsOn(day);
      if (active.length === 0) return null;
      const totalWeight = active.reduce((sum, h) => sum + h.weight, 0);
      return active.reduce((sum, h) => sum + h.weight * habitProgress(h, day), 0) / totalWeight;
    },
    [habitsOn, habitProgress],
  );

  // Counts consecutive scheduled days that were done. Unscheduled days are
  // skipped, and today not being done yet doesn't break the streak.
  const streakFor = useCallback(
    (habit: Habit, today: Date) => {
      if (habit.repeat === 'once') return 0;
      let streak = 0;
      let day = today;
      for (let i = 0; i < MAX_STREAK_LOOKBACK; i++, day = addDays(day, -1)) {
        const key = toDateKey(day);
        if (key < habit.startDay) break;
        if (!isScheduled(habit, key)) continue;
        if (isDone(habit, key)) streak++;
        else if (i > 0) break;
      }
      return streak;
    },
    [isDone],
  );

  const setCount = useCallback(
    (habitId: number, day: DateKey, count: number) => {
      setLogs((prev) => ({ ...prev, [habitId]: { ...prev[habitId], [day]: count } }));
      db.setLogCount(database, habitId, day, count);
    },
    [database],
  );

  // Yes/no habits toggle; counted habits go up by one and wrap back to zero.
  const checkIn = useCallback(
    (habit: Habit, day: DateKey) => {
      const current = countFor(habit.id, day);
      setCount(habit.id, day, current >= habit.target ? 0 : current + 1);
    },
    [countFor, setCount],
  );

  const setCountFor = useCallback(
    (habit: Habit, day: DateKey, count: number) => setCount(habit.id, day, count),
    [setCount],
  );

  const decrement = useCallback(
    (habit: Habit, day: DateKey) => {
      setCount(habit.id, day, Math.max(countFor(habit.id, day) - 1, 0));
    },
    [countFor, setCount],
  );

  const increment = useCallback(
    (habit: Habit, day: DateKey) => {
      setCount(habit.id, day, Math.min(countFor(habit.id, day) + 1, habit.target));
    },
    [countFor, setCount],
  );

  const addHabit = useCallback(
    async (input: HabitInput) => {
      const id = await db.insertHabit(database, toRecordInput(input));
      setAllHabits((prev) => [
        ...prev,
        {
          ...input,
          id,
          startDay: input.startDay ?? toDateKey(new Date()),
          archived: false,
          sortOrder: Math.max(0, ...prev.map((h) => h.sortOrder)) + 1,
        },
      ]);
    },
    [database],
  );

  const editHabit = useCallback(
    async (id: number, input: HabitInput) => {
      await db.updateHabit(database, id, toRecordInput(input));
      setAllHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...input } : h)));
    },
    [database],
  );

  const removeHabit = useCallback(
    async (id: number) => {
      await db.deleteHabit(database, id);
      setAllHabits((prev) => prev.filter((h) => h.id !== id));
      setLogs((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [database],
  );

  const setNote = useCallback(
    async (habit: Habit, day: DateKey, note: string | null, mood: number | null) => {
      await db.setLogNote(database, habit.id, day, note, mood);
      setEntries((prev) => ({
        ...prev,
        [habit.id]: {
          ...prev[habit.id],
          [day]: { ...(prev[habit.id]?.[day] ?? EMPTY_ENTRY), note, mood },
        },
      }));
    },
    [database],
  );

  const addFocusTime = useCallback(
    async (habit: Habit, day: DateKey, minutes: number) => {
      if (minutes <= 0) return;
      await db.addSpent(database, habit.id, day, minutes);
      setEntries((prev) => {
        const current = prev[habit.id]?.[day] ?? EMPTY_ENTRY;
        return {
          ...prev,
          [habit.id]: {
            ...prev[habit.id],
            [day]: { ...current, spentMin: current.spentMin + minutes },
          },
        };
      });
    },
    [database],
  );

  const archiveHabit = useCallback(
    async (id: number, archived: boolean) => {
      await db.setArchived(database, id, archived);
      setAllHabits((prev) => prev.map((h) => (h.id === id ? { ...h, archived } : h)));
    },
    [database],
  );

  const moveOnceTask = useCallback(
    async (id: number, day: DateKey) => {
      await db.setOnceDay(database, id, day);
      setAllHabits((prev) => prev.map((h) => (h.id === id ? { ...h, onceDay: day } : h)));
    },
    [database],
  );

  const moveHabit = useCallback(
    async (id: number, direction: -1 | 1, within: Habit[]) => {
      const list = [...within].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = list.findIndex((h) => h.id === id);
      const swapWith = list[index + direction];
      if (index < 0 || !swapWith) return;
      [list[index], list[index + direction]] = [swapWith, list[index]];
      // Renumber everything so the order stays stable.
      const ordered = [...list, ...allHabits.filter((h) => !list.some((l) => l.id === h.id))];
      const orders = new Map(ordered.map((h, i) => [h.id, i]));
      setAllHabits((prev) =>
        prev
          .map((h) => ({ ...h, sortOrder: orders.get(h.id) ?? h.sortOrder }))
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      await db.setSortOrders(
        database,
        ordered.map((h) => h.id),
      );
    },
    [allHabits, database],
  );

  const value = useMemo(
    () => ({
      loaded,
      habits,
      archivedHabits,
      totals,
      entryFor,
      setNote,
      addFocusTime,
      archiveHabit,
      moveOnceTask,
      moveHabit,
      reload,
      getHabit,
      isScheduled,
      habitsOn,
      firstDay,
      countFor,
      isDone,
      habitProgress,
      dayProgress,
      streakFor,
      checkIn,
      decrement,
      setCountFor,
      increment,
      addHabit,
      editHabit,
      removeHabit,
    }),
    [
      loaded,
      habits,
      archivedHabits,
      totals,
      setCountFor,
      entryFor,
      setNote,
      addFocusTime,
      archiveHabit,
      moveOnceTask,
      moveHabit,
      reload,
      getHabit,
      habitsOn,
      firstDay,
      countFor,
      isDone,
      habitProgress,
      dayProgress,
      streakFor,
      checkIn,
      decrement,
      increment,
      addHabit,
      editHabit,
      removeHabit,
    ],
  );

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used inside HabitsProvider');
  return ctx;
}
