import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { addDays, toDateKey } from '@/lib/dates';
import { parseDays, withRestDays, yesterdayStatus } from '@/lib/streak';
import { IconName, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// Kind words about yesterday on Today: a freeze that saved the streak, an offer to
// repair a broken one by finishing today at 100%, its progress, and the result.
export function DayCheck({ today }: { today: Date }) {
  const { firstDay, dayProgress } = useHabits();
  const settings = useSettings();
  const todayKey = toDateKey(today);
  const yesterday = toDateKey(addDays(today, -1));
  const status = yesterdayStatus(
    firstDay,
    today,
    withRestDays(dayProgress, settings.isPro ? settings.restDays : '', settings.streakThreshold),
    settings.repairedDays,
    settings.streakThreshold,
    settings.freezesPerMonth,
  );
  const todayPercent = Math.round((dayProgress(todayKey) ?? 0) * 100);
  const pending = status.kind === 'broken' && settings.repairPending === status.day;
  const repairedYesterday = parseDays(settings.repairedDays).has(yesterday);

  // Finishing today at 100% completes a pending repair.
  const { update, repairedDays } = settings;
  useEffect(() => {
    if (pending && todayPercent >= 100) {
      update({
        repairedDays: [...parseDays(repairedDays), yesterday].join(','),
        repairPending: '',
      });
    }
  }, [pending, todayPercent, update, repairedDays, yesterday]);

  const seen = (tag: string) => settings.dayCheckSeen === `${yesterday}:${tag}`;
  const markSeen = (tag: string) => settings.update({ dayCheckSeen: `${yesterday}:${tag}` });

  let card: React.ReactNode = null;
  if (repairedYesterday && !seen('repaired')) {
    card = (
      <Card
        icon="sparkles"
        tone="good"
        title="Streak repaired!"
        body="You finished today at 100%, so yesterday counts. That’s how comebacks work."
        primary={{ label: 'Nice', onPress: () => markSeen('repaired') }}
      />
    );
  } else if (status.kind === 'frozen' && !seen('frozen')) {
    card = (
      <Card
        icon="snow-outline"
        tone="calm"
        title="A streak freeze covered yesterday"
        body={`Your ${status.streak}-day streak is safe. ${status.freezesLeft} freeze${status.freezesLeft === 1 ? '' : 's'} left this month. Rest days are part of the plan.`}
        primary={{ label: 'Got it', onPress: () => markSeen('frozen') }}
      />
    );
  } else if (pending) {
    card = (
      <Card
        icon="construct-outline"
        tone="calm"
        title={`Repairing your ${status.lost}-day streak`}
        body={`Today is at ${todayPercent}%. Reach 100% and yesterday counts again.`}
        progress={todayPercent / 100}
      />
    );
  } else if (status.kind === 'broken' && !seen('broken')) {
    card = status.canRepair ? (
      <Card
        icon="heart-outline"
        tone="calm"
        title={`Your ${status.lost}-day streak slipped yesterday`}
        body="One off day doesn’t undo the work. Finish everything today (100%) and I’ll repair it."
        primary={{
          label: 'Repair it',
          onPress: () => settings.update({ repairPending: status.day }),
        }}
        secondary={{ label: 'Start fresh', onPress: () => markSeen('broken') }}
      />
    ) : (
      <Card
        icon="leaf-outline"
        tone="calm"
        title="A fresh start today"
        body={`Yesterday broke the streak and this month’s repair is used. Your ${status.lost} days still happened, and today is day one of the next run.`}
        primary={{ label: 'Let’s go', onPress: () => markSeen('broken') }}
      />
    );
  }

  return card;
}

function Card({
  icon,
  tone,
  title,
  body,
  primary,
  secondary,
  progress,
}: {
  icon: IconName;
  tone: 'good' | 'calm';
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  progress?: number;
}) {
  return (
    <View style={[styles.card, tone === 'good' && styles.cardGood]}>
      <View style={styles.head}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      {progress !== undefined && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
      )}
      {(primary || secondary) && (
        <View style={styles.buttons}>
          {secondary && (
            <Pressable onPress={secondary.onPress} hitSlop={8} accessibilityRole="button">
              <Text style={styles.secondary}>{secondary.label}</Text>
            </Pressable>
          )}
          {primary && (
            <Pressable onPress={primary.onPress} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryText}>{primary.label}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardGood: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  secondary: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryText: { color: colors.onAccent, fontSize: 14, fontWeight: '600' },
});
