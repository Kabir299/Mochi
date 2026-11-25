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
import { paymentsEnabled } from '@/lib/purchases';
import type { ThemeChoice } from '@/theme';

export type Settings = {
  // Has an active Pro subscription (see lib/purchases.ts), or FREE_LAUNCH.
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
  // Ask for fingerprint / Face ID / passcode when the app opens.
  appLock: boolean;
  // The home-screen widget may show task names (off: only how many are left).
  widgetNames: boolean;
  // The Nutrition tab asked for a body goal (answered or "Not now").
  bodyGoalAsked: boolean;
  // Missed days brought back by finishing the next day at 100%, comma separated.
  repairedDays: string;
  // The missed day being repaired today, or ''.
  repairPending: string;
  // The last missed day whose card was answered or dismissed, so it shows once.
  dayCheckSeen: string;
  // Weekdays (0 = Sunday, comma separated) where skipping keeps every streak.
  restDays: string;
  // Focus timer keeps the screen awake while it runs.
  focusKeepAwake: boolean;
  // The walkthroughs on Today and on the first visit to Nutrition have been shown.
  guideSeen: boolean;
  nutritionGuideSeen: boolean;
  // What the Health tab shows, chosen on the first visit (see TrackPicker).
  trackAsked: boolean;
  trackFood: boolean;
  trackWater: boolean;
  trackGym: boolean;
  // Light, dark, or whatever the phone is set to.
  theme: ThemeChoice;
  // Friends and invites as JSON (see lib/buddyLinks.ts), and the name you share under.
  buddyLinks: string;
  shareName: string;
  // Identifies this phone to the buddy server; made the first time you link with someone.
  syncSecret: string;
  // The day the AI buddy was turned on, or '' when it's off.
  aiBuddySince: string;
  aiBuddyName: string;
  // Accepted challenges as JSON (see lib/challenges.ts).
  challenges: string;
  // Weekly league tier and past results as JSON (see lib/league.ts).
  league: string;
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
  appLock: true,
  widgetNames: false,
  bodyGoalAsked: false,
  repairedDays: '',
  repairPending: '',
  dayCheckSeen: '',
  // Sunday off has always been the default, so past Sundays must stay protected.
  restDays: '0',
  focusKeepAwake: false,
  guideSeen: false,
  nutritionGuideSeen: false,
  trackAsked: false,
  trackFood: false,
  trackWater: false,
  trackGym: false,
  theme: 'system',
  buddyLinks: '',
  shareName: '',
  syncSecret: '',
  aiBuddySince: '',
  aiBuddyName: 'Kumo',
  challenges: '',
  league: '',
};

type SettingsContextValue = Settings & {
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
  // Re-reads everything, e.g. after a backup is restored.
  reload: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

// Store builds without RevenueCat keys have no way to pay, so everything is unlocked there.
export const FREE_LAUNCH = !__DEV__ && !paymentsEnabled;

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
    // On unless the person turned it off.
    appLock: raw.appLock !== '0',
    widgetNames: raw.widgetNames === '1',
    bodyGoalAsked: raw.bodyGoalAsked === '1',
    repairedDays: raw.repairedDays ?? '',
    repairPending: raw.repairPending ?? '',
    dayCheckSeen: raw.dayCheckSeen ?? '',
    restDays: raw.restDays ?? DEFAULTS.restDays,
    focusKeepAwake: raw.focusKeepAwake === '1',
    guideSeen: raw.guideSeen === '1',
    nutritionGuideSeen: raw.nutritionGuideSeen === '1',
    trackAsked: raw.trackAsked === '1',
    trackFood: raw.trackFood === '1',
    trackWater: raw.trackWater === '1',
    trackGym: raw.trackGym === '1',
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : DEFAULTS.theme,
    buddyLinks: raw.buddyLinks ?? '',
    shareName: raw.shareName ?? '',
    syncSecret: raw.syncSecret ?? '',
    aiBuddySince: raw.aiBuddySince ?? '',
    aiBuddyName: raw.aiBuddyName || DEFAULTS.aiBuddyName,
    profile: raw.profile ?? '',
    challenges: raw.challenges ?? '',
    league: raw.league ?? '',
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

  const reload = useCallback(async () => {
    setSettings(parse(await db.getSettings(database)));
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

  const value = useMemo(
    () => ({ ...settings, loaded, update, reload }),
    [settings, loaded, update, reload],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
