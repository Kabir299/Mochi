import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { formatDuration } from '@/lib/dates';
import type { Mood } from '@/lib/encouragement';
import { closeModal } from '@/lib/nav';
import { cancelFocusEnd, scheduleFocusEnd } from '@/lib/reminders';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const LENGTHS = [15, 25, 45, 60];
const DEFAULT_LENGTH = 25;
const MAX_LENGTH = 480;
const KEEP_AWAKE_TAG = 'focus';

// What the pet says, from start to finish, so it feels like working side by side.
function petLine(name: string, phase: 'ready' | 'running' | 'paused' | 'done', left: number) {
  if (phase === 'ready') return `I’ll focus with you. Pick a length and press start.`;
  if (phase === 'paused') return 'Take a breath. I’ll wait right here.';
  if (phase === 'done') return 'We did it! That’s real progress.';
  if (left > 0.75) return `${name} is focusing too. Phone down, one thing at a time.`;
  if (left > 0.5) return 'Nice rhythm. Keep going.';
  if (left > 0.25) return 'Past halfway. You’re doing great.';
  if (left > 0.08) return 'Home stretch. Stay with it.';
  return 'Almost there!';
}

const PHASE_MOOD: Record<'ready' | 'running' | 'paused' | 'done', Mood> = {
  ready: 'happy',
  running: 'okay',
  paused: 'sleepy',
  done: 'ecstatic',
};

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
  const settings = useSettings();
  const habit = getHabit(habitId)!;
  const endNotice = useRef<string | null>(null);
  const [breathe] = useState(() => new Animated.Value(1));
  const [lengthMin, setLengthMin] = useState(habit.durationMin ?? DEFAULT_LENGTH);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [banked, setBanked] = useState(0); // ms from earlier runs before a pause
  // Only read while running, and set when the timer starts.
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState(false);
  // Typed minutes; shown when the habit's own length isn't a preset, or after tapping Custom.
  const [custom, setCustom] = useState<string | null>(() =>
    LENGTHS.includes(lengthMin) ? null : String(lengthMin),
  );

  const typeMinutes = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
    setCustom(digits);
    const n = Number(digits);
    if (n > 0) setLengthMin(Math.min(MAX_LENGTH, n));
  };

  const running = startedAt !== null;
  const elapsedMs = banked + (running ? now - startedAt : 0);
  const remainingMs = Math.max(0, lengthMin * 60_000 - elapsedMs);

  const finish = useCallback(
    async (completed: boolean, totalMs: number) => {
      if (finished) return;
      setStartedAt(null);
      setBanked(totalMs);
      setFinished(true);
      cancelFocusEnd(endNotice.current).catch(() => {});
      endNotice.current = null;
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

  // Keeps the screen on while the timer runs, if the person ticked it.
  useEffect(() => {
    if (!running || !settings.focusKeepAwake) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running, settings.focusKeepAwake]);

  // The pet breathes slowly while you work.
  useEffect(() => {
    if (!running) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.06, duration: 2000, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [running, breathe]);

  // Leaving the screen mid-session drops the "done" notification with it.
  useEffect(
    () => () => {
      cancelFocusEnd(endNotice.current).catch(() => {});
    },
    [],
  );

  const toggle = async () => {
    if (running) {
      setBanked(elapsedMs);
      setStartedAt(null);
      const id = endNotice.current;
      endNotice.current = null;
      await cancelFocusEnd(id).catch(() => {});
    } else {
      const t = Date.now();
      setNow(t);
      setStartedAt(t);
      endNotice.current = await scheduleFocusEnd(
        (lengthMin * 60_000 - banked) / 1000,
        `${habit.name} done!`,
        `${settings.petName}: We focused for ${formatDuration(lengthMin)}. Come back and check it off.`,
      ).catch(() => null);
    }
  };

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0');
  const progress = 1 - remainingMs / (lengthMin * 60_000);
  const phase = finished ? 'done' : running ? 'running' : elapsedMs > 0 ? 'paused' : 'ready';

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Focus" leftLabel={finished ? 'Done' : 'Close'} />
      <View style={styles.content}>
        <Animated.View style={{ transform: [{ scale: breathe }] }}>
          <Pet mood={PHASE_MOOD[phase]} />
        </Animated.View>
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>
            {petLine(settings.petName, phase, remainingMs / (lengthMin * 60_000))}
          </Text>
        </View>
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
                {LENGTHS.map((m) => {
                  const on = custom === null && m === lengthMin;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setCustom(null);
                        setLengthMin(m);
                      }}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{m} min</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setCustom(String(lengthMin))}
                  style={[styles.chip, custom !== null && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: custom !== null }}
                >
                  <Text style={[styles.chipText, custom !== null && styles.chipTextOn]}>
                    Custom
                  </Text>
                </Pressable>
              </View>
            )}
            {!running && elapsedMs === 0 && custom !== null && (
              <View style={styles.customRow}>
                <TextInput
                  value={custom}
                  onChangeText={typeMinutes}
                  keyboardType="number-pad"
                  autoFocus
                  selectTextOnFocus
                  maxLength={3}
                  style={styles.customInput}
                  accessibilityLabel="Focus length in minutes"
                />
                <Text style={styles.chipText}>minutes (up to {MAX_LENGTH})</Text>
              </View>
            )}
            <Pressable
              onPress={() => settings.update({ focusKeepAwake: !settings.focusKeepAwake })}
              style={styles.tickRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: settings.focusKeepAwake }}
              hitSlop={8}
            >
              <Ionicons
                name={settings.focusKeepAwake ? 'checkbox' : 'square-outline'}
                size={20}
                color={settings.focusKeepAwake ? colors.accent : colors.textMuted}
              />
              <Text style={styles.chipText}>Keep screen on</Text>
            </Pressable>
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
  bubble: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: 320,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  tickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customInput: {
    minWidth: 72,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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
