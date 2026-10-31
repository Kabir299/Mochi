import { ReactNode, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Segmented } from '@/components/Segmented';
import { confirmDestructive } from '@/lib/confirm';
import * as db from '@/lib/db';
import { remindersSupported, requestReminderPermission } from '@/lib/reminders';
import { useHabits } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { FREE_LAUNCH, useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const THRESHOLDS = [
  ['0.6', '60%'],
  ['0.7', '70%'],
  ['0.8', '80%'],
  ['0.9', '90%'],
  ['1', '100%'],
] as const;
type Threshold = (typeof THRESHOLDS)[number][0];

const MAX_FREEZES = 5;
// Set once PRIVACY.md is hosted (e.g. on GitHub Pages).
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;

export default function SettingsScreen() {
  const database = useSQLiteContext();
  const settings = useSettings();
  const { archivedHabits, archiveHabit, removeHabit, reload } = useHabits();
  const nutrition = useNutrition();
  const [petName, setPetName] = useState(settings.petName);

  const exportData = async () => {
    const json = JSON.stringify(await db.exportAll(database), null, 2);
    if (Platform.OS === 'web') {
      // Browsers can't share text files, so download it instead.
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'habit-tracker-export.json';
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ message: json, title: 'Habit tracker export' });
  };

  const resetAll = async () => {
    const ok = await confirmDestructive(
      'Delete all data?',
      'Every habit, check-in, note, water and food log will be erased from this phone. This can’t be undone.',
      'Delete everything',
    );
    if (!ok) return;
    await db.deleteAllData(database);
    await Promise.all([reload(), nutrition.reload()]);
    // Back to the setup questions, like a fresh install.
    await settings.update({ petName: 'Mochi', onboarded: false });
    setPetName('Mochi');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Settings</Text>

        <Section title="Streak">
          <Text style={styles.label}>Daily progress needed to keep the streak</Text>
          <Segmented
            options={THRESHOLDS}
            value={String(settings.streakThreshold) as Threshold}
            onChange={(v) => settings.update({ streakThreshold: Number(v) })}
          />
          <View style={styles.row}>
            <Text style={styles.rowText}>Streak freezes per month</Text>
            <Stepper
              value={settings.freezesPerMonth}
              onChange={(v) =>
                settings.update({ freezesPerMonth: Math.min(MAX_FREEZES, Math.max(0, v)) })
              }
            />
          </View>
        </Section>

        <Section title="Your pet">
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={petName}
            onChangeText={setPetName}
            onBlur={() => settings.update({ petName: petName.trim() || 'Mochi' })}
            placeholder="Mochi"
            placeholderTextColor={colors.iconMuted}
            style={styles.input}
            maxLength={20}
          />
        </Section>

        <Section title="Reminders">
          <ToggleRow
            label="Remind me when a task starts"
            value={settings.remindersOn}
            onChange={async (v) => {
              // Turning it on asks for permission; stays off if the user says no.
              const allowed = v ? await requestReminderPermission() : false;
              settings.update({ remindersOn: v && allowed });
            }}
          />
          {settings.remindersOn && (
            <View style={styles.leadRow}>
              {[0, 5, 10, 15].map((m) => {
                const on = settings.reminderLead === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => settings.update({ reminderLead: m })}
                    style={[styles.leadChip, on && styles.leadChipOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.leadText, on && styles.leadTextOn]}>
                      {m === 0 ? 'At start' : `${m} min before`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <ToggleRow
            label="Evening nudge if my streak is at risk"
            value={settings.streakNudge}
            onChange={async (v) => {
              const allowed = v ? await requestReminderPermission() : false;
              settings.update({ streakNudge: v && allowed });
            }}
          />
          <ToggleRow
            label="Sunday recap of my week"
            value={settings.weeklyRecap}
            onChange={async (v) => {
              const allowed = v ? await requestReminderPermission() : false;
              settings.update({ weeklyRecap: v && allowed });
            }}
          />
          {!remindersSupported && (
            <Text style={styles.label}>
              {Platform.OS === 'web'
                ? 'Reminders only work in the phone app.'
                : 'Reminders need the full app build on Android. They don’t run inside Expo Go.'}
            </Text>
          )}
        </Section>

        <Section title="More">
          <LinkRow
            icon="compass-outline"
            label="Redo setup questions"
            onPress={() => router.push('/onboarding?redo=1')}
          />
          <LinkRow
            icon="albums-outline"
            label="Habit templates"
            onPress={() => router.push('/templates')}
          />
          {!FREE_LAUNCH && (
            <LinkRow icon="diamond-outline" label="Pro" onPress={() => router.push('/pro')} />
          )}
          <LinkRow icon="share-outline" label="Export my data" onPress={exportData} />
          {PRIVACY_URL && (
            <LinkRow
              icon="shield-checkmark-outline"
              label="Privacy policy"
              onPress={() => Linking.openURL(PRIVACY_URL!)}
            />
          )}
        </Section>

        <Section title="Archived habits">
          {archivedHabits.length === 0 && (
            <Text style={styles.label}>Archived habits keep their history and show up here.</Text>
          )}
          {archivedHabits.map((habit) => (
            <View key={habit.id} style={styles.row}>
              <Ionicons name={habit.icon} size={18} color={colors.textMuted} />
              <Text style={styles.rowText} numberOfLines={1}>
                {habit.name}
              </Text>
              <Pressable onPress={() => archiveHabit(habit.id, false)} hitSlop={8}>
                <Text style={styles.link}>Restore</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const ok = await confirmDestructive(
                    `Delete "${habit.name}"?`,
                    'Its history will be deleted too.',
                    'Delete',
                  );
                  if (ok) await removeHabit(habit.id);
                }}
                hitSlop={8}
                accessibilityLabel={`Delete ${habit.name}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </Section>

        <Pressable onPress={resetAll} style={styles.danger}>
          <Ionicons name="warning-outline" size={18} color={colors.danger} />
          <Text style={styles.dangerText}>Delete all data</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accentDark, false: colors.border }}
        thumbColor={value ? colors.accent : colors.textMuted}
      />
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: | 'compass-outline'
    | 'albums-outline'
    | 'diamond-outline'
    | 'share-outline'
    | 'shield-checkmark-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(value - 1)}
        style={styles.stepButton}
        accessibilityLabel="Fewer"
      >
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        style={styles.stepButton}
        accessibilityLabel="More"
      >
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 36,
  },
  leadRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  leadChip: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  leadChipOn: {
    backgroundColor: colors.accent,
  },
  leadText: {
    color: colors.text,
    fontSize: 13,
  },
  leadTextOn: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  rowText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  danger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.card,
    paddingVertical: spacing.md + 2,
  },
  dangerText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '500',
  },
});
