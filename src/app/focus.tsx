import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { formatDuration } from '@/lib/dates';
import { closeModal } from '@/lib/nav';
import { useHabits } from '@/state/habits';
import { colors, radius, spacing } from '@/theme';

const LENGTHS = [15, 25, 45, 60];
const DEFAULT_LENGTH = 25;

export default function FocusScreen() {
  const { id, day } = useLocalSearchParams<{ id: string; day: string }>();
  const { loaded, getHabit } = useHabits();
  if (!loaded) return <SafeAreaView style={styles.safe} />;
  const habit = getHabit(Number(id));
  if (!habit || !day) {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Focus" />
        <Text style={styles.missing}>Habit not found.</Text>
      </SafeAreaView>
    );
  }
  return <FocusTimer habitId={habit.id} day={day} />;
}

// Wall-clock based, so the time stays right if the app is backgrounded.
function FocusTimer({ habitId, day }: { habitId: number; day: string }) {
  const { getHabit, checkIn, countFor, addFocusTime } = useHabits();
  const habit = getHabit(habitId)!;
  const [lengthMin, setLengthMin] = useState(habit.durationMin ?? DEFAULT_LENGTH);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0); // ms from earlier runs before a pause
  // Only read while running, and set when the timer starts.
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState(false);

  const running = startedAt !== null;
  const elapsedMs = banked + (running ? now - startedAt : 0);
  const remainingMs = Math.max(0, lengthMin * 60_000 - elapsedMs);

  const finish = useCallback(
    async (completed: boolean, totalMs: number) => {
      if (finished) return;
      setStartedAt(null);
      setBanked(totalMs);
      setFinished(true);
      await addFocusTime(habit, day, Math.round(totalMs / 60_000));
      if (completed && countFor(habit.id, day) < habit.target) checkIn(habit, day);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [finished, addFocusTime, habit, day, countFor, checkIn],
  );

  // Ticks the clock; when time's up, records it and checks the habit in.
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const total = banked + (t - startedAt);
      if (total >= lengthMin * 60_000) {
        clearInterval(timer);
        finish(true, lengthMin * 60_000);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [startedAt, banked, lengthMin, finish]);

  const toggle = () => {
    if (running) {
      setBanked(elapsedMs);
      setStartedAt(null);
    } else {
      const t = Date.now();
      setNow(t);
      setStartedAt(t);
    }
  };

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0');
  const progress = 1 - remainingMs / (lengthMin * 60_000);

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Focus" leftLabel={finished ? 'Done' : 'Close'} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Ionicons name={habit.icon} size={20} color={colors.textMuted} />
          <Text style={styles.habit}>{habit.name}</Text>
        </View>

        <Text style={styles.clock} accessibilityRole="timer">
          {mm}:{ss}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>

        {finished ? (
          <View style={styles.doneBox}>
            <Ionicons name="checkmark-circle" size={40} color={colors.accent} />
            <Text style={styles.doneText}>
              {formatDuration(Math.round(elapsedMs / 60_000))} of focus logged.
            </Text>
            <Pressable onPress={closeModal} style={styles.primary}>
              <Text style={styles.primaryText}>Back to my day</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {!running && elapsedMs === 0 && (
              <View style={styles.lengths}>
                {LENGTHS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setLengthMin(m)}
                    style={[styles.chip, m === lengthMin && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, m === lengthMin && styles.chipTextOn]}>
                      {m} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable onPress={toggle} style={styles.primary} accessibilityRole="button">
              <Ionicons name={running ? 'pause' : 'play'} size={20} color={colors.onAccent} />
              <Text style={styles.primaryText}>
                {running ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start'}
              </Text>
            </Pressable>
            {elapsedMs > 0 && (
              <Pressable onPress={() => finish(true, elapsedMs)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Finish now and check in</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  missing: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  habit: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  clock: {
    color: colors.text,
    fontSize: 72,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  track: {
    alignSelf: 'stretch',
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  lengths: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextOn: {
    color: colors.onAccent,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
  },
  primaryText: {
    color: colors.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  secondary: {
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '500',
  },
  doneBox: {
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  doneText: {
    color: colors.text,
    fontSize: 16,
  },
});
