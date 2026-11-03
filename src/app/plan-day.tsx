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
import { PrivacyNote } from '@/components/PrivacyNote';
import { ProLock } from '@/components/ProLock';
import {
  DayPlan,
  DumpTask,
  minuteToTime,
  Priority,
  requestBrainDump,
  requestDayPlan,
  timeToMinute,
} from '@/lib/ai';
import { formatDuration, formatMinute, fromDateKey, toDateKey } from '@/lib/dates';
import { HABIT_ICONS } from '@/lib/icons';
import { closeModal } from '@/lib/nav';
import { IconName, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// When to do the flexible tasks. `null` window = any time today.
const WINDOWS: { id: string; label: string; from: number; to: number }[] = [
  { id: 'morning', label: 'Morning', from: 6 * 60, to: 12 * 60 },
  { id: 'afternoon', label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { id: 'evening', label: 'Evening', from: 17 * 60, to: 22 * 60 },
  { id: 'night', label: 'Late night', from: 21 * 60, to: 23 * 60 + 59 },
];
const BUDGETS = [30, 60, 120, 180, 240, 360, 480];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const PRIORITY_COLOR: Record<Priority, string> = {
  high: colors.accent,
  medium: colors.water,
  low: colors.textMuted,
};
const DEFAULT_TASK_MIN = 30;
// Tasks pulled from the text box aren't saved until the plan is applied, so they get
// stand-in ids well above any real habit id.
const NEW_ID = 1_000_000;
const FALLBACK_ICON: IconName = 'checkmark-circle-outline';

type NewTask = DumpTask & { id: number };
type PlanItem = DayPlan['plan'][number];

// Suggests start times for the day's untimed tasks. Anything typed or dictated in the box
// at the top becomes new tasks first. Then it asks when to do them, how much time they get
// in total, and what matters most (or lets the AI decide). Nothing is saved until the plan
// is applied: one-off tasks get the time directly; repeating habits keep it for every day.
export default function PlanDayScreen() {
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = dayParam ?? toDateKey(new Date());
  const { isPro } = useSettings();
  const { habitsOn, isDone, getHabit, editHabit, addHabit } = useHabits();
  const [text, setText] = useState('');
  // New tasks found in the text box, and the text they came from, so it's only re-read
  // when it changes.
  const [extra, setExtra] = useState<{ from: string; tasks: NewTask[] } | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [aiPriorities, setAiPriorities] = useState(true);
  const [priorities, setPriorities] = useState<Record<number, Priority>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [applied, setApplied] = useState(false);

  const tasks = habitsOn(day);
  const flexible = tasks.filter((h) => h.startMinute === null && !isDone(h, day));
  const needed = flexible.reduce((sum, h) => sum + (h.durationMin ?? DEFAULT_TASK_MIN), 0);
  const typed = text.trim();
  const canPlan = flexible.length > 0 || typed !== '';
  const newTasks = extra?.tasks ?? [];
  const nameOf = (id: number) =>
    getHabit(id)?.name ?? newTasks.find((t) => t.id === id)?.name ?? null;
  const priorityOf = (id: number) => priorities[id] ?? 'medium';
  const cyclePriority = (id: number) =>
    setPriorities((p) => ({
      ...p,
      [id]: PRIORITIES[(PRIORITIES.indexOf(priorityOf(id)) + 1) % PRIORITIES.length],
    }));

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const isToday = day === toDateKey(now);
      const nowTime = minuteToTime(now.getHours() * 60 + now.getMinutes());

      let found: NewTask[] = [];
      if (typed && extra?.from === typed) found = extra.tasks;
      else if (typed) {
        const dump = await requestBrainDump({
          text: typed,
          day,
          weekday: fromDateKey(day).toLocaleDateString('en-US', {
            weekday: 'long',
          }),
          now: isToday ? nowTime : null,
          existing: tasks.map((h) => ({
            name: h.name,
            start_time: h.startMinute === null ? null : minuteToTime(h.startMinute),
            duration_min: h.durationMin,
          })),
          allowed_icons: HABIT_ICONS,
        });
        found = dump.tasks.map((t, i) => ({ ...t, id: NEW_ID + i }));
      }
      setExtra(typed ? { from: typed, tasks: found } : null);

      const isFlexible = (id: number) =>
        flexible.some((h) => h.id === id) || found.some((t) => t.id === id && !t.start_time);
      if (flexible.length === 0 && !found.some((t) => isFlexible(t.id))) {
        // Everything new came with a time; there's nothing left to place.
        setPlan({ plan: [], skipped: [], summary: '' });
        return;
      }

      const chosen = WINDOWS.find((w) => w.id === windowId);
      const result = await requestDayPlan({
        day,
        now: isToday ? nowTime : '07:00',
        work_window: chosen
          ? { from: minuteToTime(chosen.from), to: minuteToTime(chosen.to) }
          : null,
        time_budget_min: budget,
        tasks: [
          ...tasks.map((h) => ({
            id: h.id,
            name: h.name,
            start_time: h.startMinute === null ? null : minuteToTime(h.startMinute),
            duration_min: h.durationMin,
            done: isDone(h, day),
            fixed: h.startMinute !== null,
            priority: h.startMinute !== null || aiPriorities ? null : priorityOf(h.id),
          })),
          ...found.map((t) => ({
            id: t.id,
            name: t.name,
            start_time: t.start_time,
            duration_min: t.duration_min,
            done: false,
            fixed: t.start_time !== null,
            priority: null,
          })),
        ],
      });
      // Only keep suggestions for tasks that were actually flexible.
      setPlan({
        ...result,
        plan: result.plan.filter((p) => isFlexible(p.id)),
        skipped: (result.skipped ?? []).filter((p) => isFlexible(p.id)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    // New tasks are added with their planned time, the time they were given, or none if
    // they didn't fit, so nothing that was said gets lost.
    for (const task of newTasks) {
      const planned = plan.plan.find((p) => p.id === task.id);
      const start = timeToMinute(planned?.start_time ?? task.start_time);
      const minutes = planned?.duration_min ?? task.duration_min;
      await addHabit({
        name: task.name.slice(0, 40),
        icon: (HABIT_ICONS as string[]).includes(task.icon)
          ? (task.icon as IconName)
          : FALLBACK_ICON,
        target: Math.min(99, Math.max(1, Math.round(task.target || 1))),
        unit: task.target > 1 ? task.unit : null,
        repeat: task.repeat === 'daily' ? 'daily' : 'once',
        weight: Math.min(3, Math.max(1, Math.round(task.weight || 2))),
        startMinute: start,
        durationMin: minutes ? Math.max(5, minutes) : start === null ? null : DEFAULT_TASK_MIN,
        days: [],
        onceDay: day,
        startDay: day < toDateKey(new Date()) ? day : undefined,
      });
    }
    for (const item of plan.plan) {
      if (item.id >= NEW_ID) continue;
      const habit = getHabit(item.id);
      const start = timeToMinute(item.start_time);
      if (!habit || start === null) continue;
      await editHabit(habit.id, {
        ...habit,
        startMinute: start,
        durationMin: Math.max(5, item.duration_min),
      });
    }
    setApplied(true);
  };

  // New tasks that came with their own time show in the plan too.
  const sorted: PlanItem[] = plan
    ? [
        ...plan.plan,
        ...newTasks
          .filter((t) => t.start_time !== null)
          .map((t) => ({
            id: t.id,
            start_time: t.start_time as string,
            duration_min: t.duration_min ?? DEFAULT_TASK_MIN,
            priority: 'medium' as Priority,
            reason: 'The time you mentioned',
          })),
      ].sort((a, b) => a.start_time.localeCompare(b.start_time))
    : [];
  const repeating = sorted.some((p) =>
    p.id >= NEW_ID
      ? newTasks.find((t) => t.id === p.id)?.repeat === 'daily'
      : getHabit(p.id)?.repeat !== 'once',
  );
  const newLeftOut = plan?.skipped.some((p) => p.id >= NEW_ID) ?? false;

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Plan my day" />
      <PrivacyNote />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!isPro ? (
          <ProLock
            title="Let AI plan your day"
            body="Say what’s on your mind and when you want to work; Mochi turns it into tasks and fits them in by priority."
          />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>Anything else on your mind?</Text>
              <TextInput
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  setPlan(null);
                  setError(null);
                }}
                placeholder="Call mum this evening, gym at 6, finish the report…"
                placeholderTextColor={colors.iconMuted}
                style={styles.input}
                multiline
                maxLength={4000}
              />
              <Text style={styles.note}>
                Optional. Tap the mic on your keyboard to say it. New tasks are added when you apply
                the plan.
              </Text>
            </View>

            {flexible.length === 0 && (
              <Text style={styles.body}>
                Everything on{' '}
                {fromDateKey(day).toLocaleDateString(undefined, {
                  weekday: 'long',
                })}{' '}
                already has a time or is done
                {typed ? '.' : ', so add anything new above.'}
              </Text>
            )}

            <View style={styles.card}>
              <Text style={styles.title}>When do you want to do them?</Text>
              <View style={styles.chips}>
                <Chip label="Any time" on={windowId === null} onPress={() => setWindowId(null)} />
                {WINDOWS.map((w) => (
                  <Chip
                    key={w.id}
                    label={w.label}
                    hint={`${formatMinute(w.from)}–${formatMinute(w.to % 1440)}`}
                    on={windowId === w.id}
                    onPress={() => setWindowId(w.id)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>How much time for all of them?</Text>
              {flexible.length > 0 && (
                <Text style={styles.body}>
                  {flexible.length === 1 ? 'This task needs' : `Your ${flexible.length} tasks need`}{' '}
                  about {formatDuration(needed)}
                  {typed ? ', plus anything new' : ''}.
                </Text>
              )}
              <View style={styles.chips}>
                <Chip label="No limit" on={budget === null} onPress={() => setBudget(null)} />
                {BUDGETS.map((m) => (
                  <Chip
                    key={m}
                    label={formatDuration(m)}
                    on={budget === m}
                    onPress={() => setBudget(m)}
                  />
                ))}
              </View>
              {budget !== null && budget < needed && (
                <Text style={styles.note}>
                  That’s less than they need, so lower-priority tasks get shortened or left out.
                </Text>
              )}
            </View>

            {flexible.length > 0 && (
              <View style={styles.card}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>What matters most?</Text>
                  <View style={styles.chips}>
                    <Chip
                      label="AI decides"
                      on={aiPriorities}
                      onPress={() => setAiPriorities(true)}
                    />
                    <Chip
                      label="I’ll set it"
                      on={!aiPriorities}
                      onPress={() => setAiPriorities(false)}
                    />
                  </View>
                </View>
                {flexible.map((h) => (
                  <View key={h.id} style={styles.taskRow}>
                    <Ionicons name={h.icon} size={16} color={colors.textMuted} />
                    <Text style={styles.taskName}>{h.name}</Text>
                    <Text style={styles.taskMeta}>
                      {formatDuration(h.durationMin ?? DEFAULT_TASK_MIN)}
                    </Text>
                    {!aiPriorities && (
                      <Pressable
                        onPress={() => cyclePriority(h.id)}
                        style={[styles.priority, { borderColor: PRIORITY_COLOR[priorityOf(h.id)] }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${h.name} priority ${PRIORITY_LABEL[priorityOf(h.id)]}, tap to change`}
                      >
                        <Text
                          style={[styles.priorityText, { color: PRIORITY_COLOR[priorityOf(h.id)] }]}
                        >
                          {PRIORITY_LABEL[priorityOf(h.id)]}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                {!aiPriorities && (
                  <Text style={styles.note}>
                    Tap a priority to change it.
                    {typed ? ' Mochi sets it for new tasks.' : ''}
                  </Text>
                )}
              </View>
            )}

            {loading && (
              <View style={[styles.card, styles.center]}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.body}>
                  {typed && extra?.from !== typed
                    ? 'Reading your list…'
                    : 'Finding the best slots…'}
                </Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}

            {plan && !loading && (
              <View style={styles.card}>
                <Text style={styles.title}>Suggested plan</Text>
                {plan.summary !== '' && <Text style={styles.body}>{plan.summary}</Text>}
                {extra && newTasks.length === 0 && (
                  <Text style={styles.body}>No new tasks found in what you wrote.</Text>
                )}
                {sorted.map((p) => {
                  const name = nameOf(p.id);
                  const start = timeToMinute(p.start_time);
                  if (!name || start === null) return null;
                  const level = PRIORITIES.includes(p.priority) ? p.priority : 'medium';
                  return (
                    <View key={p.id} style={styles.planRow}>
                      <Text style={styles.planTime}>{formatMinute(start)}</Text>
                      <View style={styles.planBody}>
                        <Text style={styles.taskName}>
                          {name}
                          {p.id >= NEW_ID && <Text style={styles.newTag}>{'  '}NEW</Text>}
                        </Text>
                        <Text style={styles.reason}>
                          {formatDuration(p.duration_min)} ·{' '}
                          <Text style={{ color: PRIORITY_COLOR[level] }}>
                            {PRIORITY_LABEL[level]}
                          </Text>{' '}
                          · {p.reason}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                {plan.skipped.length > 0 && (
                  <View style={styles.skipped}>
                    <Text style={styles.skippedTitle}>Didn’t fit</Text>
                    {plan.skipped.map((p) => {
                      const name = nameOf(p.id);
                      if (!name) return null;
                      return (
                        <Text key={p.id} style={styles.reason}>
                          {name}: {p.reason}
                        </Text>
                      );
                    })}
                    {newLeftOut && (
                      <Text style={styles.note}>
                        New tasks that didn’t fit are added with no time.
                      </Text>
                    )}
                  </View>
                )}
                {repeating && !applied && (
                  <Text style={styles.note}>
                    Repeating habits will keep these times every day. You can change them later.
                  </Text>
                )}
              </View>
            )}

            {!loading &&
              (applied ? (
                <Pressable onPress={closeModal} style={styles.button}>
                  <Ionicons name="checkmark" size={18} color={colors.onAccent} />
                  <Text style={styles.buttonText}>Added to your timeline</Text>
                </Pressable>
              ) : plan && (sorted.length > 0 || newTasks.length > 0) ? (
                <>
                  <Pressable onPress={apply} style={styles.button}>
                    <Text style={styles.buttonText}>Apply this plan</Text>
                  </Pressable>
                  <Pressable onPress={run} style={styles.secondary}>
                    <Text style={styles.secondaryText}>Try another plan</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={run}
                  disabled={!canPlan}
                  style={[styles.button, !canPlan && styles.disabled]}
                >
                  <Ionicons name="sparkles-outline" size={18} color={colors.onAccent} />
                  <Text style={styles.buttonText}>Plan it for me</Text>
                </Pressable>
              ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  label,
  hint,
  on,
  onPress,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      {hint && <Text style={[styles.chipHint, on && styles.chipTextOn]}>{hint}</Text>}
    </Pressable>
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  center: {
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  titleRow: {
    gap: spacing.sm,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
  },
  chipHint: {
    color: colors.textMuted,
    fontSize: 11,
  },
  chipTextOn: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  taskName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  taskMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  newTag: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  priority: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 64,
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  planRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  planTime: {
    width: 72,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  planBody: {
    flex: 1,
    gap: 2,
  },
  reason: {
    color: colors.textMuted,
    fontSize: 13,
  },
  skipped: {
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  skippedTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    color: colors.iconMuted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
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
});
