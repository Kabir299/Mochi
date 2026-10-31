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

export type Settings = {
  // Unlocked locally for now; swap for a real in-app purchase check before release.
  isPro: boolean;
  waterGoalMl: number;
  calorieGoal: number;
  proteinGoal: number;
  // Daily % (0..1) that keeps the day streak going.
  streakThreshold: number;
  freezesPerMonth: number;
  petName: string;
  // Wardrobe choices, see lib/wardrobe.ts.
  petColor: string;
  petItem: string;
  // Notifications at each timed habit's start.
  remindersOn: boolean;
  // Minutes before a task's start to send its reminder (0 = at the start).
  reminderLead: number;
  // Sunday evening "your week" notification.
  weeklyRecap: boolean;
  // Evening nudge when the streak isn't secured yet.
  streakNudge: boolean;
  // First-launch questions answered (or skipped).
  onboarded: boolean;
  // Answers from onboarding as JSON (see lib/profile.ts); '' if never answered.
  profile: string;
};

const DEFAULTS: Settings = {
  isPro: false,
  waterGoalMl: 2500,
  calorieGoal: 2000,
  proteinGoal: 100,
  streakThreshold: 0.8,
  freezesPerMonth: 3,
  petName: 'Mochi',
  petColor: 'mint',
  petItem: 'auto',
  remindersOn: false,
  reminderLead: 0,
  weeklyRecap: true,
  streakNudge: true,
  onboarded: false,
  profile: '',
};

type SettingsContextValue = Settings & {
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// Store builds have no real purchases yet, so everything is unlocked there.
// Set to false once RevenueCat purchases are wired up.
export const FREE_LAUNCH = !__DEV__;

function parse(raw: Record<string, string>): Settings {
  const num = (key: keyof Settings, fallback: number) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    isPro: raw.isPro === '1' || FREE_LAUNCH,
    waterGoalMl: num('waterGoalMl', DEFAULTS.waterGoalMl),
    calorieGoal: num('calorieGoal', DEFAULTS.calorieGoal),
    proteinGoal: num('proteinGoal', DEFAULTS.proteinGoal),
    streakThreshold: num('streakThreshold', DEFAULTS.streakThreshold),
    // 0 is a valid choice here, so it can't use num().
    freezesPerMonth:
      raw.freezesPerMonth !== undefined ? Number(raw.freezesPerMonth) : DEFAULTS.freezesPerMonth,
    petName: raw.petName || DEFAULTS.petName,
    petColor: raw.petColor || DEFAULTS.petColor,
    petItem: raw.petItem || DEFAULTS.petItem,
    remindersOn: raw.remindersOn === '1',
    reminderLead: raw.reminderLead !== undefined ? Number(raw.reminderLead) : 0,
    weeklyRecap: raw.weeklyRecap !== undefined ? raw.weeklyRecap === '1' : DEFAULTS.weeklyRecap,
    streakNudge: raw.streakNudge !== undefined ? raw.streakNudge === '1' : DEFAULTS.streakNudge,
    onboarded: raw.onboarded === '1',
    profile: raw.profile ?? '',
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const database = useSQLiteContext();
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    db.getSettings(database).then((raw) => {
      if (cancelled) return;
      setSettings(parse(raw));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [database]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
      for (const [key, value] of Object.entries(patch)) {
        const stored = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
        await db.setSetting(database, key, stored);
      }
    },
    [database],
  );

  const value = useMemo(() => ({ ...settings, loaded, update }), [settings, loaded, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
