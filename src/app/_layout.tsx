import { Fragment, useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, useColorScheme, View } from 'react-native';
import { ErrorBoundary as RouterError, ErrorBoundaryProps, Stack } from 'expo-router';
import { SQLiteDatabase, SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { ChallengeWatch } from '@/components/ChallengeWatch';
import { FocusJailReward } from '@/components/FocusJailReward';
import { PurchasesSync } from '@/components/PurchasesSync';
import { ReminderSync } from '@/components/ReminderSync';
import { WidgetSync } from '@/components/WidgetSync';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';
import { ensureLocalTables, saveDailySnapshot } from '@/lib/snapshots';
import { applyKey, DbChoice, prepareDatabase } from '@/lib/secureDb';
import { AccountProvider } from '@/state/account';
import { BuddySyncProvider } from '@/state/buddySync';
import { HabitsProvider } from '@/state/habits';
import { NutritionProvider } from '@/state/nutrition';
import { SettingsProvider, useSettings } from '@/state/settings';
import { applyTheme, colors } from '@/theme';

// Picks the theme, then draws every screen with it. The key redraws them all when it changes.
function ThemedScreens() {
  const settings = useSettings();
  const phone = useColorScheme();
  const mode =
    settings.theme === 'system' ? (phone === 'light' ? 'light' : 'dark') : settings.theme;
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
        <Stack.Screen name="copies" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenges" options={{ presentation: 'modal' }} />
        <Stack.Screen name="challenge" options={{ presentation: 'modal' }} />
        <Stack.Screen name="league" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" />
      </Stack>
      <ChallengeWatch />
      <FocusJailReward />
      <AppLock />
    </Fragment>
  );
}

// On the web only one tab can hold the database. Says so instead of leaving a blank page.
export function ErrorBoundary(props: ErrorBoundaryProps) {
  if (Platform.OS !== 'web' || !/access handle/i.test(props.error.message)) {
    return <RouterError {...props} />;
  }
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>
        Mochi is already open in another tab or window. Close that one, then try again.
      </Text>
      <Pressable onPress={() => window.location.reload()} accessibilityRole="button">
        <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
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
      await ensureLocalTables(database);
      // A failed copy must never stop the app from opening.
      await saveDailySnapshot(database).catch(() => {});
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
              <WidgetSync />
              <PurchasesSync />
              <AccountProvider>
                <BuddySyncProvider>
                  <ThemedScreens />
                </BuddySyncProvider>
              </AccountProvider>
            </NutritionProvider>
          </HabitsProvider>
        </SettingsProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
