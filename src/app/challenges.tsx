import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import {
  amountLabel,
  CATEGORY_LABEL,
  Challenge,
  ChallengeIdea,
  IDEAS,
  pointsFor,
  sprintEnd,
  TIER_LABEL,
  tierOf,
} from '@/lib/challenges';
import { confirmDestructive } from '@/lib/confirm';
import { addDays, fromDateKey, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/useToday';
import { challengeXp, TIERS } from '@/lib/league';
import { useChallenges } from '@/state/useChallenges';
import { useLeague } from '@/state/useLeague';
import { colors, radius, spacing, themedStyles } from '@/theme';

// Event handlers only; render reads the `now` state instead.
const clockNow = () => Date.now();

const openIdea = (key: string) => router.push({ pathname: '/challenge', params: { key } });

export default function ChallengesScreen() {
  const { active, history, stats, change, remove } = useChallenges();
  const today = useToday();
  const todayKey = toDateKey(today);
  // Refreshes "min left" on running sprints.
  const [now, setNow] = useState(clockNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(clockNow()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const league = useLeague();
  const tier = TIERS[league.tier];

  const rollDare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const pick = IDEAS[Math.floor(Math.random() * IDEAS.length)];
    openIdea(pick.key);
  };

  const tickToday = (c: Challenge) => {
    const done = c.doneDays.includes(todayKey);
    const doneDays = done ? c.doneDays.filter((d) => d !== todayKey) : [...c.doneDays, todayKey];
    if (!done) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const won = doneDays.length >= (c.days ?? 1);
    change(c.id, won ? { doneDays, status: 'won', endedAt: clockNow() } : { doneDays });
  };

  const forfeit = async (c: Challenge) => {
    const ok = await confirmDestructive(
      `Give up "${c.title}"?`,
      'It goes in your history as lost.',
      'Give up',
    );
    if (ok) change(c.id, { status: 'lost', endedAt: clockNow(), lostReason: 'Gave up' });
  };

  const sprints = IDEAS.filter((i) => i.kind === 'sprint');
  const runs = IDEAS.filter((i) => i.kind === 'run');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ModalHeader title="Challenges" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.push('/league')}
          style={({ pressed }) => [styles.rankCard, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <View style={styles.rankRow}>
            <View style={[styles.tierDot, { backgroundColor: tier.color }]}>
              <Ionicons name={tier.icon} size={20} color="#1B1B22" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rankName}>
                #{league.rank} in {tier.name} League
              </Text>
              <Text style={styles.muted}>{league.youXp} XP this week · tap for the table</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
          <View style={styles.statRow}>
            <Stat value={stats.won} label="won" />
            <Stat value={stats.finished - stats.won} label="lost" />
            <Stat value={stats.winStreak} label="wins in a row" />
          </View>
        </Pressable>

        <View style={styles.buttonRow}>
          <Pressable
            onPress={rollDare}
            style={({ pressed }) => [styles.dice, pressed && styles.pressed]}
          >
            <Ionicons name="dice-outline" size={22} color={colors.onAccent} />
            <Text style={styles.diceText}>Roll a dare</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/challenge', params: { custom: '1' } })}
            style={({ pressed }) => [styles.ownButton, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={20} color={colors.accent} />
            <Text style={styles.ownText}>Make my own</Text>
          </Pressable>
        </View>

        {active.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>In progress</Text>
            {active.map((c) =>
              c.kind === 'sprint' ? (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/challenge', params: { id: c.id } })}
                  style={styles.activeCard}
                >
                  <Ionicons name={c.icon} size={22} color={colors.accent} />
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{c.title}</Text>
                    <Text style={styles.muted}>
                      {Math.max(1, Math.ceil((sprintEnd(c) - now) / 60_000))} min left · tap to go
                      back
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ) : (
                <RunCard
                  key={c.id}
                  c={c}
                  todayKey={todayKey}
                  onTick={() => tickToday(c)}
                  onForfeit={() => forfeit(c)}
                />
              ),
            )}
          </View>
        )}

        <IdeaSection title="Sprints · one sitting" ideas={sprints} />
        <IdeaSection title="Runs · every day" ideas={runs} />

        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trophy shelf</Text>
            {history.map((c) => (
              <Pressable
                key={c.id}
                onLongPress={async () => {
                  const ok = await confirmDestructive(
                    'Remove from history?',
                    `"${c.title}" and its XP will be removed.`,
                    'Remove',
                  );
                  if (ok) remove(c.id);
                }}
                style={styles.historyRow}
              >
                <Ionicons
                  name={c.status === 'won' ? 'trophy' : 'close-circle-outline'}
                  size={18}
                  color={c.status === 'won' ? colors.streak : colors.textMuted}
                />
                <Text style={[styles.historyTitle, c.status === 'lost' && styles.lost]}>
                  {c.title}
                </Text>
                <Text style={styles.muted}>
                  {c.status === 'won' ? `+${challengeXp(c)} XP` : (c.lostReason ?? 'Lost')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function RunCard({
  c,
  todayKey,
  onTick,
  onForfeit,
}: {
  c: Challenge;
  todayKey: string;
  onTick: () => void;
  onForfeit: () => void;
}) {
  const days = c.days ?? 1;
  const doneToday = c.doneDays.includes(todayKey);
  const start = fromDateKey(c.startDay);
  return (
    <View style={styles.activeCard}>
      <View style={styles.flex}>
        <View style={styles.runHead}>
          <Ionicons name={c.icon} size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, styles.flex]}>{c.title}</Text>
          <Pressable onPress={onForfeit} hitSlop={10} accessibilityLabel="Give up">
            <Ionicons name="flag-outline" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.dots}>
          {Array.from({ length: days }, (_, i) => {
            const key = toDateKey(addDays(start, i));
            const done = c.doneDays.includes(key);
            return (
              <View
                key={key}
                style={[
                  styles.dayDot,
                  done && styles.dayDotDone,
                  key === todayKey && styles.dayDotToday,
                ]}
              />
            );
          })}
        </View>
        <View style={styles.runFoot}>
          <Text style={styles.muted}>
            Day {Math.min(days, c.doneDays.length + (doneToday ? 0 : 1))} of {days} · +
            {challengeXp(c)} XP
          </Text>
          <Pressable
            onPress={onTick}
            style={[styles.tick, doneToday && styles.tickDone]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: doneToday }}
          >
            <Ionicons
              name={doneToday ? 'checkmark' : 'ellipse-outline'}
              size={16}
              color={doneToday ? colors.onAccent : colors.accent}
            />
            <Text style={[styles.tickText, doneToday && styles.tickTextDone]}>
              {doneToday ? 'Done today' : 'Did it today'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function IdeaSection({ title, ideas }: { title: string; ideas: ChallengeIdea[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {ideas.map((idea) => {
        const amount = (idea.kind === 'sprint' ? idea.minutes : idea.days) ?? 1;
        const tier = tierOf(idea.kind, amount);
        return (
          <Pressable
            key={idea.key}
            onPress={() => openIdea(idea.key)}
            style={({ pressed }) => [styles.idea, pressed && styles.pressed]}
          >
            <View style={styles.ideaIcon}>
              <Ionicons name={idea.icon} size={22} color={colors.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{idea.title}</Text>
              <Text style={styles.muted} numberOfLines={2}>
                {idea.blurb}
              </Text>
              <View style={styles.tags}>
                <Text style={[styles.tag, tier === 'boss' && styles.bossTag]}>
                  {TIER_LABEL[tier]}
                </Text>
                <Text style={styles.tag}>{amountLabel(idea)}</Text>
                <Text style={styles.tag}>{CATEGORY_LABEL[idea.category]}</Text>
                {idea.lockIn && <Text style={styles.tag}>Lock-in</Text>}
                <Text style={styles.points}>+{pointsFor(idea.kind, amount, !!idea.lockIn)} XP</Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  muted: { color: colors.textMuted, fontSize: 13 },
  rankCard: {
    backgroundColor: colors.proBg,
    borderRadius: radius.card + 4,
    padding: spacing.lg,
    gap: spacing.md,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rankName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  tierDot: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.streak },
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  dice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  diceText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
  ownButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
  },
  ownText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  section: { gap: spacing.sm },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.doneBg,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  runHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginVertical: spacing.sm },
  dayDot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dayDotDone: { backgroundColor: colors.accent },
  dayDotToday: { borderWidth: 2, borderColor: colors.accent },
  runFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  tickDone: { backgroundColor: colors.accent },
  tickText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  tickTextDone: { color: colors.onAccent },
  idea: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  ideaIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.doneBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  tag: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  bossTag: { color: colors.danger, backgroundColor: colors.dangerBg },
  points: { color: colors.streak, fontSize: 12, fontWeight: '700', marginLeft: 'auto' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  historyTitle: { flex: 1, color: colors.text, fontSize: 15 },
  lost: { color: colors.textMuted, textDecorationLine: 'line-through' },
}));
