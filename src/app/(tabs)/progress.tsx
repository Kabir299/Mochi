import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressChart } from '@/components/ProgressChart';
import { Segmented } from '@/components/Segmented';
import { YearHeatmap } from '@/components/YearHeatmap';
import { badgesFor } from '@/lib/badges';
import { addDays, lastNDays, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/useToday';
import { computeDayStreak } from '@/lib/streak';
import { useSettings } from '@/state/settings';
import { average, habitStats, insights, pct, points1, series } from '@/lib/stats';
import { useHabits } from '@/state/habits';
import { colors, radius, spacing } from '@/theme';

type Range = '7' | '30';
const RANGES = [
  ['7', '7 days'],
  ['30', '30 days'],
] as const;

export default function ProgressScreen() {
  const { habits, dayProgress, habitProgress, firstDay, totals } = useHabits();
  const settings = useSettings();
  const [range, setRange] = useState<Range>('7');
  const days = Number(range);

  const today = useToday();
  const fns = { habits, dayProgress, habitProgress };

  const points = series(today, days, dayProgress);
  const current = average(points.map((p) => p.value));
  const previous = average(series(addDays(today, -days), days, dayProgress).map((p) => p.value));
  const delta = current !== null && previous !== null ? current - previous : null;
  const perfectDays = points.filter((p) => p.value === 1).length;
  const stats = habitStats(today, days, fns).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  const notes = insights(today, days, fns);

  const dayStreak = computeDayStreak(
    firstDay,
    today,
    dayProgress,
    settings.streakThreshold,
    settings.freezesPerMonth,
  );
  const perfectDaysYear = lastNDays(today, 365).filter(
    (d) => dayProgress(toDateKey(d)) === 1,
  ).length;
  const badges = badgesFor({
    totalCheckIns: totals.checkIns,
    bestDayStreak: dayStreak.best,
    perfectDays: perfectDaysYear,
    focusMinutes: totals.focusMinutes,
    notes: totals.notes,
    habitCount: habits.length,
  });

  // A picture card with the pet and the week; it falls back to text where images can't be shared.
  const shareProgress = () =>
    router.push({
      pathname: '/share-card',
      params: { best: String(dayStreak.best), current: String(dayStreak.current) },
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Progress</Text>
          <Pressable
            onPress={() => shareProgress()}
            style={styles.shareButton}
            accessibilityRole="button"
            accessibilityLabel="Share my progress"
          >
            <Ionicons name="share-social-outline" size={20} color={colors.accent} />
          </Pressable>
        </View>

        <Segmented options={RANGES} value={range} onChange={setRange} />

        {habits.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              Add a habit on the Today tab and your progress will show up here.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Average daily progress</Text>
              <View style={styles.heroRow}>
                <Text style={styles.hero}>{pct(current)}</Text>
                {delta !== null && Math.round(delta * 100) !== 0 && (
                  <View style={[styles.delta, delta > 0 ? styles.deltaUp : styles.deltaDown]}>
                    <Ionicons
                      name={delta > 0 ? 'arrow-up' : 'arrow-down'}
                      size={14}
                      color={delta > 0 ? colors.accent : colors.danger}
                    />
                    <Text
                      style={[
                        styles.deltaText,
                        { color: delta > 0 ? colors.accent : colors.danger },
                      ]}
                    >
                      {points1(delta)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.sub}>
                {delta === null
                  ? `Over the last ${days} days`
                  : `vs ${pct(previous)} in the ${days} days before · ${perfectDays} perfect ${perfectDays === 1 ? 'day' : 'days'}`}
              </Text>
              <View style={styles.chart}>
                <ProgressChart key={range} points={points} />
              </View>
            </View>

            <Pressable
              onPress={() => router.push('/ai-analysis')}
              style={({ pressed }) => [styles.aiCard, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={styles.aiIcon}>
                <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
              </View>
              <View style={styles.aiBody}>
                <Text style={styles.aiTitle}>AI analysis</Text>
                <Text style={styles.sub}>Get a personal review and tips to improve</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>How each habit is doing</Text>
              {stats.length === 0 && <Text style={styles.sub}>No repeating habits yet.</Text>}
              {stats.map(({ habit, rate, previousRate }) => {
                const change = rate !== null && previousRate !== null ? rate - previousRate : null;
                return (
                  <View key={habit.id} style={styles.habitRow}>
                    <View style={styles.habitTop}>
                      <Ionicons name={habit.icon} size={16} color={colors.textMuted} />
                      <Text style={styles.habitName} numberOfLines={1}>
                        {habit.name}
                      </Text>
                      {change !== null && Math.round(change * 100) !== 0 && (
                        <Text
                          style={[
                            styles.habitChange,
                            { color: change > 0 ? colors.accent : colors.danger },
                          ]}
                        >
                          {change > 0 ? '▲' : '▼'} {points1(change)}
                        </Text>
                      )}
                      <Text style={styles.habitRate}>{pct(rate)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round((rate ?? 0) * 100)}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {notes.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Insights</Text>
                {notes.map((note) => (
                  <View key={note.text} style={styles.insight}>
                    <Ionicons name={note.icon} size={18} color={colors.accent} />
                    <Text style={styles.insightText}>{note.text}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Your year</Text>
              <YearHeatmap today={today} dayProgress={dayProgress} />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                Badges · {badges.filter((b) => b.earned).length} of {badges.length}
              </Text>
              <View style={styles.badges}>
                {badges.map((badge) => (
                  <View
                    key={badge.id}
                    style={[styles.badge, !badge.earned && styles.badgeLocked]}
                    accessibilityLabel={`${badge.name}, ${badge.description}, ${badge.earned ? 'earned' : 'not yet earned'}`}
                  >
                    <View style={[styles.badgeIcon, badge.earned && styles.badgeIconEarned]}>
                      <Ionicons
                        name={badge.earned ? badge.icon : 'lock-closed-outline'}
                        size={20}
                        color={badge.earned ? colors.streak : colors.iconMuted}
                      />
                    </View>
                    <Text style={styles.badgeName} numberOfLines={1}>
                      {badge.name}
                    </Text>
                    <Text style={styles.badgeDesc} numberOfLines={2}>
                      {badge.description}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    width: '31%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  badgeLocked: {
    opacity: 0.55,
  },
  badgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconEarned: {
    backgroundColor: colors.proBg,
  },
  badgeName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeDesc: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hero: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '700',
  },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deltaUp: {
    backgroundColor: colors.accentDark,
  },
  deltaDown: {
    backgroundColor: colors.dangerBg,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chart: {
    marginTop: spacing.md,
  },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accentDark,
    padding: spacing.lg,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBody: {
    flex: 1,
    gap: 2,
  },
  aiTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  habitRow: {
    gap: 6,
    paddingVertical: 6,
  },
  habitTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  habitName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  habitChange: {
    fontSize: 12,
    fontWeight: '500',
  },
  habitRate: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 44,
    textAlign: 'right',
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  insight: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  insightText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
