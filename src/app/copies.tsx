import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { confirmDestructive } from '@/lib/confirm';
import { listSnapshots, loadSnapshot, replaceAll, SnapshotInfo } from '@/lib/snapshots';
import { useHabits } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const REASONS: Record<SnapshotInfo['reason'], string> = {
  daily: 'Daily copy',
  before_sync: 'Before sync replaced data',
  before_restore: 'Before a restore',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Copies the app keeps by itself (see lib/snapshots.ts), to undo a wrong sync or restore.
export default function CopiesScreen() {
  const database = useSQLiteContext();
  const { reload } = useHabits();
  const nutrition = useNutrition();
  const settings = useSettings();
  const [copies, setCopies] = useState<SnapshotInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => listSnapshots(database).then(setCopies, () => setCopies([])),
    [database],
  );
  useEffect(() => {
    load();
  }, [load]);

  const restore = async (copy: SnapshotInfo) => {
    const when = new Date(copy.madeAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const ok = await confirmDestructive(
      'Restore this copy?',
      `${plural(copy.habits, 'habit')} and ${plural(copy.ticks, 'check-in')} from ${when}. What’s on this device now is kept here as another copy first.`,
      'Restore',
    );
    if (!ok) return;
    setError(null);
    try {
      await replaceAll(database, await loadSnapshot(database, copy.id), 'before_restore');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t restore that copy. Nothing was changed.');
      return;
    }
    await Promise.all([reload(), nutrition.reload(), settings.reload()]);
    await settings.update({ onboarded: true, guideSeen: true, nutritionGuideSeen: true });
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Earlier copies" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Mochi keeps a copy of your data each day, and another before sync or a restore replaces
          anything. They stay on this device. Tap one to bring it back.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {copies?.length === 0 && (
          <Text style={styles.intro}>No copies yet. The first one is made today.</Text>
        )}
        {copies?.map((copy) => (
          <Pressable
            key={copy.id}
            onPress={() => restore(copy)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.icon}>
              <Ionicons
                name={copy.reason === 'daily' ? 'calendar-outline' : 'shield-checkmark-outline'}
                size={20}
                color={colors.accent}
              />
            </View>
            <View style={styles.text}>
              <Text style={styles.name}>
                {new Date(copy.madeAt).toLocaleString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.meta}>
                {REASONS[copy.reason] ?? 'Copy'} · {plural(copy.habits, 'habit')},{' '}
                {plural(copy.ticks, 'check-in')}
              </Text>
            </View>
            <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.md,
  },
  intro: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
}));
