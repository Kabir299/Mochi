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
import { addDays, DateKey, toDateKey } from '@/lib/dates';

// Enough history for the 30-day charts and AI analysis.
const HISTORY_DAYS = 30;

type NutritionContextValue = {
  loaded: boolean;
  water: db.WaterLog[];
  food: db.FoodLog[];
  waterFor: (day: DateKey) => number;
  foodFor: (day: DateKey) => db.FoodLog[];
  addWater: (day: DateKey, ml: number) => Promise<void>;
  removeWater: (id: number) => Promise<void>;
  addFood: (input: db.FoodInput) => Promise<void>;
  removeFood: (id: number) => Promise<void>;
  reload: () => Promise<void>;
};

const NutritionContext = createContext<NutritionContextValue | null>(null);

export function NutritionProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const [loaded, setLoaded] = useState(false);
  const [water, setWater] = useState<db.WaterLog[]>([]);
  const [food, setFood] = useState<db.FoodLog[]>([]);

  const reload = useCallback(async () => {
    const from = toDateKey(addDays(new Date(), -(HISTORY_DAYS - 1)));
    const [waterRows, foodRows] = await Promise.all([
      db.getWaterLogs(database, from),
      db.getFoodLogs(database, from),
    ]);
    setWater(waterRows);
    setFood(foodRows);
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

  const waterFor = useCallback(
    (day: DateKey) => water.reduce((sum, w) => (w.day === day ? sum + w.ml : sum), 0),
    [water],
  );

  const foodFor = useCallback((day: DateKey) => food.filter((f) => f.day === day), [food]);

  const addWater = useCallback(
    async (day: DateKey, ml: number) => {
      const id = await db.insertWater(database, day, ml);
      setWater((prev) => [...prev, { id, day, ml }]);
    },
    [database],
  );

  const removeWater = useCallback(
    async (id: number) => {
      await db.deleteWater(database, id);
      setWater((prev) => prev.filter((w) => w.id !== id));
    },
    [database],
  );

  const addFood = useCallback(
    async (input: db.FoodInput) => {
      const id = await db.insertFood(database, input);
      setFood((prev) => [...prev, { ...input, id }]);
    },
    [database],
  );

  const removeFood = useCallback(
    async (id: number) => {
      await db.deleteFood(database, id);
      setFood((prev) => prev.filter((f) => f.id !== id));
    },
    [database],
  );

  const value = useMemo(
    () => ({
      loaded,
      water,
      food,
      waterFor,
      foodFor,
      addWater,
      removeWater,
      addFood,
      removeFood,
      reload,
    }),
    [loaded, water, food, waterFor, foodFor, addWater, removeWater, addFood, removeFood, reload],
  );

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}

export function useNutrition() {
  const ctx = useContext(NutritionContext);
  if (!ctx) throw new Error('useNutrition must be used inside NutritionProvider');
  return ctx;
}
