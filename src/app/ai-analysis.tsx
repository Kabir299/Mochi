import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { ProLock } from '@/components/ProLock';
import { Analysis, hasEnoughData, requestAnalysis } from '@/lib/ai';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { useAiPayload } from '@/state/useAiPayload';
import { colors, radius, spacing } from '@/theme';

export default function AiAnalysisScreen() {
  const { dayProgress } = useHabits();
  const settings = useSettings();
  const buildPayload = useAiPayload();
  const today = useMemo(() => new Date(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  const enoughData = hasEnoughData(today, dayProgress);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await requestAnalysis(buildPayload()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="AI analysis" />
      <PrivacyNote />
      <ScrollView contentContainerStyle={styles.content}>
        {!settings.isPro ? (
          <ProLock
            title="Your personal habit coach"
            body="Mochi reads your last 30 days of habits, water and food, then tells you what's working, what's slipping and exactly what to try next."
          />
        ) : !enoughData ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              Add a habit and check in for a day or two, then come back for your analysis.
            </Text>
          </View>
        ) : (
          <>
            {!result && !loading && (
              <View style={styles.card}>
                <View style={styles.introIcon}>
                  <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
                </View>
                <Text style={styles.cardTitle}>Analyze your habits</Text>
                <Text style={styles.body}>
                  Mochi reviews your completion rates, streaks and trends for the last 30 days
                  , plus your water and food logs and goals,{' '}
                  and suggests how to improve. Only summary numbers and habit names are sent.
                </Text>
              </View>
            )}

            {loading && (
              <View style={[styles.card, styles.center]}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.body}>Mochi is reviewing your last 30 days…</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {result && !loading && <AnalysisView analysis={result} />}

            {!loading && (
              <Pressable
                onPress={run}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Ionicons
                  name={result ? 'refresh' : 'sparkles-outline'}
                  size={18}
                  color={colors.onAccent}
                />
                <Text style={styles.buttonText}>
                  {result ? 'Analyze again' : 'Analyze my habits'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function AnalysisView({ analysis }: { analysis: Analysis }) {
  const { habits, editHabit } = useHabits();
  const [applied, setApplied] = useState<string[]>([]);

  // Only counted habits with a concrete new target can be applied in one tap.
  const applyTarget = async (name: string, target: number) => {
    const habit = habits.find((h) => h.name.toLowerCase() === name.toLowerCase());
    if (!habit || habit.target <= 1) return;
    await editHabit(habit.id, { ...habit, target: Math.max(2, Math.min(99, target)) });
    setApplied((prev) => [...prev, name]);
  };

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Summary</Text>
        <Text style={styles.body}>{analysis.summary}</Text>
      </View>

      <View style={styles.focusCard}>
        <Text style={styles.focusLabel}>This week’s focus</Text>
        <Text style={styles.focusText}>{analysis.weekly_focus}</Text>
      </View>

      {analysis.wins.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What’s working</Text>
          {analysis.wins.map((win) => (
            <View key={win} style={styles.listRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.listText}>{win}</Text>
            </View>
          ))}
        </View>
      )}

      {analysis.improvements.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Where to improve</Text>
          {analysis.improvements.map((item) => (
            <View key={item.habit + item.issue} style={styles.improvement}>
              <Text style={styles.improvementHabit}>{item.habit}</Text>
              <Text style={styles.body}>{item.issue}</Text>
              <View style={styles.listRow}>
                <Ionicons name="bulb-outline" size={18} color={colors.streak} />
                <Text style={styles.listText}>{item.suggestion}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {analysis.goal_adjustments?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Goal tuning</Text>
          {analysis.goal_adjustments.map((g) => {
            const habit = habits.find((h) => h.name.toLowerCase() === g.habit.toLowerCase());
            const canApply = habit !== undefined && habit.target > 1 && g.new_target !== null;
            return (
              <View key={g.habit} style={styles.improvement}>
                <View style={styles.listRow}>
                  <Ionicons
                    name={g.change === 'easier' ? 'trending-down-outline' : 'trending-up-outline'}
                    size={18}
                    color={g.change === 'easier' ? colors.water : colors.accent}
                  />
                  <Text style={styles.improvementHabit}>
                    {g.habit}: make it {g.change}
                    {g.new_target !== null ? ` (${g.new_target} a day)` : ''}
                  </Text>
                </View>
                <Text style={styles.body}>{g.reason}</Text>
                {canApply &&
                  (applied.includes(g.habit) ? (
                    <Text style={styles.appliedText}>Updated</Text>
                  ) : (
                    <Pressable
                      onPress={() => applyTarget(g.habit, g.new_target!)}
                      style={styles.applyButton}
                    >
                      <Text style={styles.applyText}>Apply new goal</Text>
                    </Pressable>
                  ))}
              </View>
            );
          })}
        </View>
      )}

      {analysis.nutrition.trim() !== '' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Water and food</Text>
          <Text style={styles.body}>{analysis.nutrition}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  applyButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentDark,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: 4,
  },
  applyText: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  appliedText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
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
    paddingVertical: spacing.xl,
  },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  focusCard: {
    backgroundColor: colors.accentDark,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  focusLabel: {
    color: colors.accentLight,
    fontSize: 13,
  },
  focusText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 23,
  },
  listRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  listText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  improvement: {
    gap: 4,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  improvementHabit: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  errorCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerBg,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  errorText: {
    flex: 1,
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
  pressed: {
    opacity: 0.7,
  },
});
