import { Fragment, useCallback, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { SQLiteDatabase, SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { PurchasesSync } from '@/components/PurchasesSync';
import { ReminderSync } from '@/components/ReminderSync';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';
import { applyKey, DbChoice, prepareDatabase } from '@/lib/secureDb';
import { HabitsProvider } from '@/state/habits';
import { NutritionProvider } from '@/state/nutrition';
import { SettingsProvider, useSettings } from '@/state/settings';
import { applyTheme, colors } from '@/theme';

// Picks the theme, then draws every screen with it. The key redraws them all when it changes.
function ThemedScreens() {
  const settings = useSettings();
  const phone = useColorScheme();
  const mode = settings.theme === 'system' ? (phone === 'light' ? 'light' : 'dark') : settings.theme;
  applyTheme(mode);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [mode]);

  // Waits for the saved choice so the wrong theme never flashes.
  if (!settings.loaded) return null;

  return (
    <Fragment key={mode}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="habit-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pro" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ai-analysis" options={{ presentation: 'modal' }} />
        <Stack.Screen name="templates" options={{ presentation: 'modal' }} />
        <Stack.Screen name="focus" options={{ presentation: 'modal' }} />
        <Stack.Screen name="note" options={{ presentation: 'modal' }} />
        <Stack.Screen name="coach" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plan-day" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pet" options={{ presentation: 'modal' }} />
        <Stack.Screen name="share-card" options={{ presentation: 'modal' }} />
        <Stack.Screen name="buddies" options={{ presentation: 'modal' }} />
      </Stack>
      <AppLock />
    </Fragment>
  );
}

export default function RootLayout() {
  const [db, setDb] = useState<DbChoice | null>(null);

  useEffect(() => {
    prepareDatabase()
      .then(setDb)
      // Never leave a blank screen: fall back to the plain database.
      .catch(() => setDb({ name: DATABASE_NAME, key: null }));
  }, []);

  // The key must be the very first statement on the connection.
  const key = db?.key ?? null;
  const onInit = useCallback(
    async (database: SQLiteDatabase) => {
      await applyKey(database, key);
      await migrateDbIfNeeded(database);
    },
    [key],
  );

  // A split second while the key is read; the splash screen covers it.
  if (!db) return null;

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={db.name} onInit={onInit}>
        <SettingsProvider>
          <HabitsProvider>
            <NutritionProvider>
              <ReminderSync />
              <PurchasesSync />
              <ThemedScreens />
            </NutritionProvider>
          </HabitsProvider>
        </SettingsProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
