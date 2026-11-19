import { Fragment, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Confetti } from '@/components/Confetti';
import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import {
  DAILY_CHALLENGE_CAP,
  DAILY_HABIT_CAP,
  DEMOTE,
  HABIT_XP,
  LEAGUE_SIZE,
  PERFECT_DAY_XP,
  PROMOTE,
  STREAK_DAY_XP,
  TIERS,
} from '@/lib/league';
import { useLeague } from '@/state/useLeague';
import { colors, radius, spacing, themedStyles } from '@/theme';

const tick = () => new Date();

function timeLeft(end: Date, now: Date) {
  const ms = Math.max(0, end.getTime() - now.getTime());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function LeagueScreen() {
  // Rivals keep earning while the screen is open.
  const [now, setNow] = useState(tick);
  useEffect(() => {
    const timer = setInterval(() => setNow(tick()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const league = useLeague(now);
  const [partyDone, setPartyDone] = useState(false);
  const tier = TIERS[league.tier];
  const result = league.unseen;

  // Confetti for a promotion, once.
  const party = result?.move === 'up' && !partyDone;

  if (!league.ready) return <SafeAreaView style={styles.safe} />;

  const lastIndex = LEAGUE_SIZE - DEMOTE;
  const canGoUp = league.tier < TIERS.length - 1;
  const canGoDown = league.tier > 0;
  const zone =
    league.rank <= PROMOTE && canGoUp
      ? `You're in the promotion zone. Hold on to it!`
      : league.rank > lastIndex && canGoDown
        ? `Danger zone! Earn ${xpToEscape(league)} XP to get out.`
        : canGoUp
          ? `${xpToPromote(league)} XP to reach the promotion zone.`
          : 'Top of the top. Defend your spot.';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ModalHeader title="League" />
      <ScrollView contentContainerStyle={styles.content}>
        {result && (
          <View style={[styles.result, result.move === 'down' && styles.resultDown]}>
            <Pet
              mood={result.move === 'up' ? 'ecstatic' : result.move === 'down' ? 'sad' : 'happy'}
            />
            <Text style={styles.resultTitle}>
              {result.move === 'up'
                ? `Promoted to ${TIERS[result.tier + 1].name}!`
                : result.move === 'down'
                  ? `Dropped to ${TIERS[result.tier - 1].name}`
                  : `You stayed in ${TIERS[result.tier].name}`}
            </Text>
            <Text style={styles.muted}>
              Last week you finished #{result.rank} with {result.xp} XP.
              {result.move === 'down' ? ' A challenge or two will win it back.' : ''}
            </Text>
            <Pressable onPress={league.markSeen} style={styles.resultButton}>
              <Text style={styles.resultButtonText}>
                {result.move === 'down' ? 'Bring it on' : 'Let’s go'}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.hero, { borderColor: tier.color }]}>
          <View style={[styles.badge, { backgroundColor: tier.color }]}>
            <Ionicons name={tier.icon} size={30} color="#1B1B22" />
          </View>
          <Text style={styles.tierName}>{tier.name} League</Text>
          <Text style={styles.muted}>Ends in {timeLeft(league.endsAt, now)}</Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>#{league.rank}</Text>
              <Text style={styles.muted}>rank</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>{league.youXp}</Text>
              <Text style={styles.muted}>XP this week</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroValue}>{league.todayXp.total}</Text>
              <Text style={styles.muted}>today</Text>
            </View>
          </View>
          <Text style={styles.zone}>{zone}</Text>
        </View>

        <View style={styles.ladder}>
          {TIERS.map((t, i) => (
            <View
              key={t.name}
              style={[
                styles.rung,
                { backgroundColor: i <= league.tier ? t.color : colors.border },
                i === league.tier && styles.rungOn,
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={() => router.push('/challenges')}
          style={({ pressed }) => [styles.boost, pressed && styles.pressed]}
        >
          <Ionicons name="flash" size={22} color={colors.onAccent} />
          <View style={styles.flex}>
            <Text style={styles.boostTitle}>Take a challenge</Text>
            <Text style={styles.boostSub}>Win 8–28 XP each, up to {DAILY_CHALLENGE_CAP} a day</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onAccent} />
        </Pressable>

        <View style={styles.table}>
          {league.table.map((p, i) => {
            const rank = i + 1;
            const up = rank <= PROMOTE && canGoUp;
            const down = rank > lastIndex && canGoDown;
            return (
              <Fragment key={p.id}>
                {i === PROMOTE && canGoUp && (
                  <View style={styles.divider}>
                    <Ionicons name="arrow-up" size={12} color={colors.accent} />
                    <Text style={[styles.dividerText, { color: colors.accent }]}>
                      Promotion zone
                    </Text>
                  </View>
                )}
                {i === lastIndex && canGoDown && (
                  <View style={styles.divider}>
                    <Ionicons name="arrow-down" size={12} color={colors.danger} />
                    <Text style={[styles.dividerText, { color: colors.danger }]}>
                      Demotion zone
                    </Text>
                  </View>
                )}
                <View style={[styles.row, p.you && styles.rowYou]}>
                  <Text
                    style={[
                      styles.rank,
                      up && { color: colors.accent },
                      down && { color: colors.danger },
                    ]}
                  >
                    {rank}
                  </Text>
                  {p.you ? (
                    <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                      <Ionicons name="person" size={16} color={colors.onAccent} />
                    </View>
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: p.color }]}>
                      {p.ai ? (
                        <Ionicons name="hardware-chip-outline" size={16} color="#1B1B22" />
                      ) : (
                        <Text style={styles.avatarText}>{p.name[0]}</Text>
                      )}
                    </View>
                  )}
                  <Text style={[styles.name, p.you && styles.nameYou]} numberOfLines={1}>
                    {p.name}
                    {p.ai ? ' (AI buddy)' : ''}
                  </Text>
                  <Text style={[styles.xp, p.you && styles.nameYou]}>{p.xp} XP</Text>
                </View>
              </Fragment>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to earn XP</Text>
          <XpLine icon="checkmark-circle-outline" label="Low-worth task" xp={HABIT_XP[1]} />
          <XpLine icon="checkmark-circle-outline" label="Medium-worth task" xp={HABIT_XP[2]} />
          <XpLine icon="checkmark-circle" label="High-worth task" xp={HABIT_XP[3]} />
          <XpLine icon="flame-outline" label="Day that keeps your streak" xp={STREAK_DAY_XP} />
          <XpLine icon="star-outline" label="Perfect 100% day" xp={PERFECT_DAY_XP} />
          <XpLine icon="trophy-outline" label="Win a challenge" text="8–28" />
          <Text style={styles.muted}>
            Tasks count up to {DAILY_HABIT_CAP} XP a day and challenges up to {DAILY_CHALLENGE_CAP}.
            Top {PROMOTE} move up a league each Monday, bottom {DEMOTE} move down. Rivals get
            tougher as you climb and as you get better.
          </Text>
        </View>
      </ScrollView>
      {party && <Confetti onDone={() => setPartyDone(true)} />}
    </SafeAreaView>
  );
}

type LeagueView = ReturnType<typeof useLeague>;

function xpToPromote(l: LeagueView) {
  const target = l.table[PROMOTE - 1];
  return Math.max(5, target.xp - l.youXp + 5);
}

function xpToEscape(l: LeagueView) {
  const target = l.table[LEAGUE_SIZE - DEMOTE - 1];
  return Math.max(5, target.xp - l.youXp + 5);
}

function XpLine({
  icon,
  label,
  xp,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  xp?: number;
  text?: string;
}) {
  return (
    <View style={styles.xpLine}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={styles.xpLabel}>{label}</Text>
      <Text style={styles.xpValue}>+{text ?? xp} XP</Text>
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
  pressed: { opacity: 0.75 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  result: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.doneBg,
    borderRadius: radius.card + 4,
    padding: spacing.lg,
  },
  resultDown: { backgroundColor: colors.dangerBg },
  resultTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  resultButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  resultButtonText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.card + 4,
    borderWidth: 2,
    padding: spacing.lg,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  tierName: { color: colors.text, fontSize: 24, fontWeight: '800' },
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  heroStat: { alignItems: 'center' },
  heroValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  zone: { color: colors.streak, fontSize: 14, fontWeight: '600', marginTop: spacing.sm },
  ladder: { flexDirection: 'row', gap: 4 },
  rung: { flex: 1, height: 6, borderRadius: radius.pill },
  rungOn: { height: 10, marginTop: -2 },
  boost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  boostTitle: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  boostSub: { color: colors.onAccent, fontSize: 13, opacity: 0.85 },
  table: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  dividerText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowYou: { backgroundColor: colors.doneBg },
  rank: {
    width: 22,
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#1B1B22', fontSize: 15, fontWeight: '800' },
  name: { flex: 1, color: colors.text, fontSize: 15 },
  nameYou: { fontWeight: '800', color: colors.accent },
  xp: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  xpLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  xpLabel: { flex: 1, color: colors.text, fontSize: 14 },
  xpValue: { color: colors.streak, fontSize: 14, fontWeight: '700' },
}));
