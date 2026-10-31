import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ReminderSync } from '@/components/ReminderSync';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/lib/db';
import { HabitsProvider } from '@/state/habits';
import { NutritionProvider } from '@/state/nutrition';
import { SettingsProvider } from '@/state/settings';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        <SettingsProvider>
          <HabitsProvider>
            <NutritionProvider>
              <StatusBar style="light" />
              <ReminderSync />
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
              </Stack>
            </NutritionProvider>
          </HabitsProvider>
        </SettingsProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
