import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { ProLock } from '@/components/ProLock';
import { DayPlan, minuteToTime, requestDayPlan, timeToMinute } from '@/lib/ai';
import { formatDuration, formatMinute, fromDateKey, toDateKey } from '@/lib/dates';
import { closeModal } from '@/lib/nav';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// Suggests start times for the day's untimed tasks. One-off tasks get the time
// directly; repeating habits are asked about, since that changes every day.
export default function PlanDayScreen() {
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = dayParam ?? toDateKey(new Date());
  const { isPro } = useSettings();
  const { habitsOn, isDone, getHabit, editHabit } = useHabits();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [applied, setApplied] = useState(false);

  const tasks = habitsOn(day);
  const flexible = tasks.filter((h) => h.startMinute === null && !isDone(h, day));

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const isToday = day === toDateKey(now);
      const result = await requestDayPlan({
        day,
        now: isToday ? minuteToTime(now.getHours() * 60 + now.getMinutes()) : '07:00',
        tasks: tasks.map((h) => ({
          id: h.id,
          name: h.name,
          start_time: h.startMinute === null ? null : minuteToTime(h.startMinute),
          duration_min: h.durationMin,
          done: isDone(h, day),
          fixed: h.startMinute !== null,
        })),
      });
      // Only keep suggestions for tasks that were actually flexible.
      setPlan({
        ...result,
        plan: result.plan.filter((p) => flexible.some((h) => h.id === p.id)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    for (const item of plan.plan) {
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

  const sorted = plan
    ? [...plan.plan].sort((a, b) => a.start_time.localeCompare(b.start_time))
    : [];
  const repeating = sorted.some((p) => getHabit(p.id)?.repeat !== 'once');

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Plan my day" />
      <PrivacyNote />
      <ScrollView contentContainerStyle={styles.content}>
        {!isPro ? (
          <ProLock
            title="Let AI plan your day"
            body="Mochi fits your untimed tasks into free slots around the ones you’ve already scheduled."
          />
        ) : flexible.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              Everything on {fromDateKey(day).toLocaleDateString(undefined, { weekday: 'long' })}{' '}
              already has a time or is done. Nothing to plan.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>{flexible.length} tasks without a time</Text>
              {flexible.map((h) => (
                <View key={h.id} style={styles.taskRow}>
                  <Ionicons name={h.icon} size={16} color={colors.textMuted} />
                  <Text style={styles.taskName}>{h.name}</Text>
                </View>
              ))}
            </View>

            {loading && (
              <View style={[styles.card, styles.center]}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.body}>Finding the best slots…</Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}

            {plan && !loading && (
              <View style={styles.card}>
                <Text style={styles.title}>Suggested plan</Text>
                <Text style={styles.body}>{plan.summary}</Text>
                {sorted.map((p) => {
                  const habit = getHabit(p.id);
                  const start = timeToMinute(p.start_time);
                  if (!habit || start === null) return null;
                  return (
                    <View key={p.id} style={styles.planRow}>
                      <Text style={styles.planTime}>{formatMinute(start)}</Text>
                      <View style={styles.planBody}>
                        <Text style={styles.taskName}>{habit.name}</Text>
                        <Text style={styles.reason}>
                          {formatDuration(p.duration_min)} · {p.reason}
                        </Text>
                      </View>
                    </View>
                  );
                })}
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
              ) : plan && sorted.length > 0 ? (
                <>
                  <Pressable onPress={apply} style={styles.button}>
                    <Text style={styles.buttonText}>Apply this plan</Text>
                  </Pressable>
                  <Pressable onPress={run} style={styles.secondary}>
                    <Text style={styles.secondaryText}>Try another plan</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={run} style={styles.button}>
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
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskName: {
    color: colors.text,
    fontSize: 15,
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
