import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { ProLock } from '@/components/ProLock';
import { DumpTask, minuteToTime, requestBrainDump, timeToMinute } from '@/lib/ai';
import { formatMinute, fromDateKey, toDateKey } from '@/lib/dates';
import { HABIT_ICONS } from '@/lib/icons';
import { closeModal } from '@/lib/nav';
import { IconName, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const FALLBACK_ICON: IconName = 'checkmark-circle-outline';

// Ramble (type or dictate with the keyboard mic), then review what Claude pulled out.
export default function BrainDumpScreen() {
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = dayParam ?? toDateKey(new Date());
  const { isPro } = useSettings();
  const { habitsOn, addHabit } = useHabits();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DumpTask[] | null>(null);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [note, setNote] = useState('');

  const extract = async () => {
    if (!text.trim()) {
      setError('Say or type something first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const result = await requestBrainDump({
        text: text.trim(),
        day,
        weekday: fromDateKey(day).toLocaleDateString('en-US', { weekday: 'long' }),
        now:
          day === toDateKey(now) ? minuteToTime(now.getHours() * 60 + now.getMinutes()) : null,
        existing: habitsOn(day).map((h) => ({
          name: h.name,
          start_time: h.startMinute === null ? null : minuteToTime(h.startMinute),
          duration_min: h.durationMin,
        })),
        allowed_icons: HABIT_ICONS,
      });
      setTasks(result.tasks);
      setPicked(result.tasks.map(() => true));
      setNote(result.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const addPicked = async () => {
    if (!tasks) return;
    for (const [i, task] of tasks.entries()) {
      if (!picked[i]) continue;
      const start = timeToMinute(task.start_time);
      const icon = (HABIT_ICONS as string[]).includes(task.icon)
        ? (task.icon as IconName)
        : FALLBACK_ICON;
      await addHabit({
        name: task.name.slice(0, 40),
        icon,
        target: Math.min(99, Math.max(1, Math.round(task.target || 1))),
        unit: task.target > 1 ? task.unit : null,
        repeat: task.repeat === 'daily' ? 'daily' : 'once',
        weight: Math.min(3, Math.max(1, Math.round(task.weight || 2))),
        startMinute: start,
        durationMin: start === null ? null : Math.max(5, task.duration_min ?? 30),
        days: [],
        onceDay: day,
        startDay: day < toDateKey(new Date()) ? day : undefined,
      });
    }
    closeModal();
  };

  const count = picked.filter(Boolean).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Brain dump" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isPro ? (
          <ProLock
            title="Ramble, get a to-do list"
            body="Talk through everything on your mind. Claude turns it into tasks with times you can review before adding."
          />
        ) : !tasks ? (
          <>
            <View style={styles.tip}>
              <Ionicons name="mic-outline" size={18} color={colors.accentLight} />
              <Text style={styles.tipText}>
                Tap the microphone on your keyboard to dictate. Ramble freely, mention times if you
                have them.
              </Text>
            </View>
            <TextInput
              value={text}
              onChangeText={(t) => {
                setText(t);
                setError(null);
              }}
              placeholder="Need to call mum this evening, gym at 6, finish the report before lunch, and I keep forgetting to drink water…"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              multiline
              autoFocus
              maxLength={4000}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.muted}>Turning that into tasks…</Text>
              </View>
            ) : (
              <Pressable onPress={extract} style={styles.button}>
                <Ionicons name="sparkles-outline" size={18} color={colors.onAccent} />
                <Text style={styles.buttonText}>Make tasks</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            {note !== '' && <Text style={styles.muted}>{note}</Text>}
            {tasks.length === 0 && (
              <Text style={styles.muted}>
                No tasks found in that. Try adding a bit more detail.
              </Text>
            )}
            {tasks.map((task, i) => {
              const start = timeToMinute(task.start_time);
              const icon = (HABIT_ICONS as string[]).includes(task.icon)
                ? (task.icon as IconName)
                : FALLBACK_ICON;
              return (
                <Pressable
                  key={i}
                  onPress={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
                  style={[styles.task, picked[i] && styles.taskOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked[i] }}
                >
                  <View style={[styles.check, picked[i] && styles.checkOn]}>
                    {picked[i] && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                  </View>
                  <Ionicons name={icon} size={16} color={colors.textMuted} />
                  <View style={styles.taskBody}>
                    <Text style={styles.taskName}>{task.name}</Text>
                    <Text style={styles.taskMeta}>
                      {start !== null ? formatMinute(start) : 'Any time'}
                      {task.repeat === 'daily' ? ' · every day' : ''}
                      {task.target > 1 ? ` · ${task.target} ${task.unit ?? 'times'}` : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              onPress={addPicked}
              disabled={count === 0}
              style={[styles.button, count === 0 && styles.disabled]}
            >
              <Text style={styles.buttonText}>
                Add {count} {count === 1 ? 'task' : 'tasks'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setTasks(null)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Edit what I said</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.md,
  },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.accentDark,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  tipText: {
    flex: 1,
    color: colors.accentLight,
    fontSize: 14,
    lineHeight: 19,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    padding: spacing.md,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
  },
  disabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  secondary: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '500',
  },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  taskOn: {
    borderColor: colors.accentDark,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.checkboxBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  taskBody: {
    flex: 1,
    gap: 2,
  },
  taskName: {
    color: colors.text,
    fontSize: 15,
  },
  taskMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
