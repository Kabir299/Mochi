import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { SQLiteDatabase, SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { PurchasesSync } from '@/components/PurchasesSync';
import { ReminderSync } from '@/components/ReminderSync';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';
import { applyKey, DbChoice, prepareDatabase } from '@/lib/secureDb';
import { DayLogsProvider } from '@/state/dayLogs';
import { HabitsProvider } from '@/state/habits';
import { NutritionProvider } from '@/state/nutrition';
import { SettingsProvider } from '@/state/settings';
import { colors } from '@/theme';

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
              <DayLogsProvider>
              <StatusBar style="light" />
              <ReminderSync />
              <PurchasesSync />
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
                <Stack.Screen name="brain-dump" options={{ presentation: 'modal' }} />
                <Stack.Screen name="plan-day" options={{ presentation: 'modal' }} />
                <Stack.Screen name="pet" options={{ presentation: 'modal' }} />
                <Stack.Screen name="share-card" options={{ presentation: 'modal' }} />
                <Stack.Screen name="recap" options={{ presentation: 'modal' }} />
              </Stack>
              <AppLock />
              </DayLogsProvider>
            </NutritionProvider>
          </HabitsProvider>
        </SettingsProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
