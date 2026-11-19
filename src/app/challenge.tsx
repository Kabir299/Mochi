import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { withoutLockIn } from '@/components/ChallengeWatch';
import { Confetti } from '@/components/Confetti';
import { HoldToCommit } from '@/components/HoldToCommit';
import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { Segmented } from '@/components/Segmented';
import {
  amountLabel,
  Challenge,
  ChallengeKind,
  IDEAS,
  newChallenge,
  pointsFor,
  sprintEnd,
  TIER_LABEL,
  tierOf,
} from '@/lib/challenges';
import { confirmDestructive } from '@/lib/confirm';
import { challengeXp } from '@/lib/league';
import type { Mood } from '@/lib/encouragement';
import { closeModal } from '@/lib/nav';
import { cancelChallengeNotice, scheduleChallengeNotice } from '@/lib/reminders';
import type { IconName } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { useChallenges } from '@/state/useChallenges';
import { colors, radius, spacing, themedStyles } from '@/theme';

const SPRINT_MINUTES = [10, 15, 25, 30, 45, 60, 90, 120, 180];
const RUN_DAYS = [2, 3, 5, 7, 10, 14, 21, 30];
const KINDS = [
  ['sprint', 'One sitting'],
  ['run', 'Every day'],
] as const;
const KEEP_AWAKE_TAG = 'challenge';

export default function ChallengeScreen() {
  const params = useLocalSearchParams<{ key?: string; id?: string; custom?: string }>();
  const { loaded } = useChallenges();
  // Set once a sprint is accepted here, so the screen turns into its timer.
  const [startedId, setStartedId] = useState<string | null>(null);
  const id = startedId ?? params.id;
  if (!loaded) return <SafeAreaView style={styles.safe} />;
  if (id) return <SprintRun id={id} />;
  return <Accept ideaKey={params.key} custom={params.custom === '1'} onSprint={setStartedId} />;
}

function Accept({
  ideaKey,
  custom,
  onSprint,
}: {
  ideaKey?: string;
  custom: boolean;
  onSprint: (id: string) => void;
}) {
  const { add } = useChallenges();
  const settings = useSettings();
  const idea = IDEAS.find((i) => i.key === ideaKey);
  const [title, setTitle] = useState(idea?.title ?? '');
  const [kind, setKind] = useState<ChallengeKind>(idea?.kind ?? 'sprint');
  const [minutes, setMinutes] = useState(idea?.minutes ?? 60);
  const [days, setDays] = useState(idea?.days ?? 7);
  const [lockIn, setLockIn] = useState(idea?.lockIn ?? false);
  const icon: IconName = idea?.icon ?? (kind === 'sprint' ? 'flash-outline' : 'calendar-outline');

  if (!idea && !custom) {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Challenge" />
        <Text style={styles.missing}>Challenge not found.</Text>
      </SafeAreaView>
    );
  }

  const amount = kind === 'sprint' ? minutes : days;
  const tier = tierOf(kind, amount);
  const xp = pointsFor(kind, amount, kind === 'sprint' && lockIn);
  const name =
    title.trim() ||
    (kind === 'sprint' ? `${amountLabel({ kind, minutes })} sprint` : `${days}-day run`);
  const chips = kind === 'sprint' ? SPRINT_MINUTES : RUN_DAYS;
  // Keeps the idea's own length as a choice when it isn't one of the chips.
  const options = chips.includes(amount) ? chips : [...chips, amount].sort((a, b) => a - b);

  const accept = async () => {
    const c = newChallenge({ kind, title: name, icon, minutes, days, lockIn });
    await add(c);
    if (kind === 'run') {
      closeModal();
      return;
    }
    scheduleChallengeNotice(
      'end',
      minutes * 60,
      `${name}: won!`,
      `${settings.petName}: You did it. +${challengeXp(c)} XP for your league.`,
    ).catch(() => {});
    onSprint(c.id);
  };

  const dare =
    kind === 'sprint'
      ? lockIn
        ? `${amountLabel({ kind, minutes })}, locked in. Leave Mochi for more than 15 seconds and it's over. Dare you?`
        : `${amountLabel({ kind, minutes })}, no pausing. I'll be right here with you.`
      : `${days} days in a row. Miss one and it's lost. Think you can?`;

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title={custom ? 'Make your own' : 'Challenge'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pet mood="happy" />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{dare}</Text>
        </View>

        {custom ? (
          <View style={styles.stretch}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={kind === 'sprint' ? 'e.g. Study chemistry' : 'e.g. No junk food'}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              maxLength={40}
              accessibilityLabel="Challenge name"
            />
            <Segmented options={KINDS} value={kind} onChange={setKind} />
          </View>
        ) : (
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              <Ionicons name={icon} size={24} color={colors.accent} />
              <Text style={styles.title}>{idea!.title}</Text>
            </View>
            <Text style={styles.blurb}>{idea!.blurb}</Text>
          </View>
        )}

        <View style={styles.stretch}>
          <Text style={styles.label}>{kind === 'sprint' ? 'How long?' : 'How many days?'}</Text>
          <View style={styles.chips}>
            {options.map((n) => {
              const on = n === amount;
              return (
                <Pressable
                  key={n}
                  onPress={() => (kind === 'sprint' ? setMinutes(n) : setDays(n))}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {kind === 'sprint' ? amountLabel({ kind, minutes: n }) : `${n} days`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {kind === 'sprint' && (
          <Pressable
            onPress={() => setLockIn(!lockIn)}
            style={[styles.lockCard, lockIn && styles.lockCardOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: lockIn }}
          >
            <Ionicons
              name={lockIn ? 'lock-closed' : 'lock-open-outline'}
              size={22}
              color={lockIn ? colors.streak : colors.textMuted}
            />
            <View style={styles.flex}>
              <Text style={styles.lockTitle}>Lock-in mode {lockIn ? 'on' : 'off'}</Text>
              <Text style={styles.muted}>
                Leaving the app (or locking the phone) for over 15 seconds loses it. Worth a little
                more XP. The screen stays on.
              </Text>
            </View>
          </Pressable>
        )}

        <View style={styles.reward}>
          <Text style={[styles.tier, tier === 'boss' && styles.boss]}>{TIER_LABEL[tier]}</Text>
          <Text style={styles.rewardText}>Win: +{xp} XP</Text>
        </View>

        <HoldToCommit onDone={accept} />
        <Text style={styles.muted}>Press and hold to accept the challenge.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function sprintLine(left: number, lockIn: boolean) {
  if (left > 0.9) return lockIn ? 'Locked in. Phone stays here, you stay focused.' : 'Go go go!';
  if (left > 0.66) return 'Good start. Find your rhythm.';
  if (left > 0.5) return 'Almost halfway. Don’t you dare quit now.';
  if (left > 0.33) return 'Past halfway! The hard part is behind you.';
  if (left > 0.1) return 'Home stretch. I can smell the trophy.';
  return 'Final seconds! Hold on!';
}

function SprintRun({ id }: { id: string }) {
  const { list, change } = useChallenges();
  const settings = useSettings();
  const c = list.find((x) => x.id === id);
  const [now, setNow] = useState(() => Date.now());
  const [party, setParty] = useState(false);
  const [closeCall, setCloseCall] = useState(false);
  const latest = useRef<{ c?: Challenge; change: typeof change }>({ c, change });
  useEffect(() => {
    latest.current = { c, change };
  });
  const active = c?.status === 'active';

  // Clock, and the win once time is up.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const cur = latest.current.c;
      if (cur && cur.status === 'active' && !cur.awaySince && t >= sprintEnd(cur)) {
        latest.current.change(cur.id, { status: 'won', endedAt: sprintEnd(cur) });
      }
    }, 250);
    return () => clearInterval(timer);
  }, [active]);

  // Celebrates a win seen happen here, whichever path marked it won.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && c?.status === 'won') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      cancelChallengeNotice('end').catch(() => {});
      setParty(true);
    }
    wasActive.current = active;
  }, [active, c?.status]);

  // Coming back within the grace (ChallengeWatch clears awaySince) gets a "phew".
  const wasAway = useRef(false);
  useEffect(() => {
    const away = !!c?.awaySince;
    if (wasAway.current && !away && c?.status === 'active') setCloseCall(true);
    wasAway.current = away;
  }, [c?.awaySince, c?.status]);

  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [active]);

  useEffect(() => {
    if (!closeCall) return;
    const t = setTimeout(() => setCloseCall(false), 4000);
    return () => clearTimeout(t);
  }, [closeCall]);

  if (!c) {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Challenge" />
        <Text style={styles.missing}>Challenge not found.</Text>
      </SafeAreaView>
    );
  }

  const total = (c.minutes ?? 1) * 60_000;
  const remaining = Math.max(0, sprintEnd(c) - now);
  const mm = String(Math.floor(remaining / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0');
  const hours = Math.floor(remaining / 3_600_000);
  const clock =
    hours > 0
      ? `${hours}:${String(Math.floor((remaining % 3_600_000) / 60_000)).padStart(2, '0')}:${ss}`
      : `${mm}:${ss}`;

  const giveUp = async () => {
    const ok = await withoutLockIn(() =>
      confirmDestructive(
        'Give up?',
        `${settings.petName} will be sad, and "${c.title}" goes in your history as lost.`,
        'Give up',
      ),
    );
    if (!ok) return;
    change(c.id, { status: 'lost', endedAt: Date.now(), lostReason: 'Gave up' });
    cancelChallengeNotice('end').catch(() => {});
  };

  const mood: Mood = c.status === 'won' ? 'ecstatic' : c.status === 'lost' ? 'sad' : 'okay';
  const line =
    c.status === 'won'
      ? `WE DID IT! ${amountLabel(c)} conquered. +${challengeXp(c)} XP.`
      : c.status === 'lost'
        ? c.lostReason === 'Left the app'
          ? 'You left me… the lock-in broke. Next time we’ll get it.'
          : 'That one got away. A rematch is always on the table.'
        : closeCall
          ? 'Phew, close call! Stay with me.'
          : sprintLine(remaining / total, c.lockIn);

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader
        title={c.lockIn ? 'Locked in' : 'Challenge'}
        leftLabel={active ? 'Hide' : 'Done'}
      />
      <View style={styles.runContent}>
        <Pet mood={mood} />
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{line}</Text>
        </View>
        <View style={styles.titleRow}>
          <Ionicons name={c.icon} size={20} color={colors.textMuted} />
          <Text style={styles.title}>{c.title}</Text>
          {c.lockIn && <Ionicons name="lock-closed" size={16} color={colors.streak} />}
        </View>

        {active ? (
          <>
            <Text style={styles.clock} accessibilityRole="timer">
              {clock}
            </Text>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${Math.round((1 - remaining / total) * 100)}%` }]}
              />
            </View>
            <Pressable onPress={giveUp} style={styles.secondary}>
              <Text style={styles.giveUp}>Give up</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.result}>
              <Ionicons
                name={c.status === 'won' ? 'trophy' : 'heart-dislike-outline'}
                size={56}
                color={c.status === 'won' ? colors.streak : colors.textMuted}
              />
              <Text style={styles.resultText}>
                {c.status === 'won' ? `+${challengeXp(c)} XP` : (c.lostReason ?? 'Lost')}
              </Text>
            </View>
            <Pressable onPress={closeModal} style={styles.primary}>
              <Text style={styles.primaryText}>
                {c.status === 'won' ? 'Collect and go back' : 'Back'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
      {party && <Confetti onDone={() => setParty(false)} />}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: colors.background },
  missing: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  content: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  runContent: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch', gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  bubble: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: 340,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  titleBlock: { alignItems: 'center', gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  blurb: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 17,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: colors.onAccent },
  lockCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  lockCardOn: { borderColor: colors.streak, backgroundColor: colors.proBg },
  lockTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tier: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  boss: { color: colors.danger, backgroundColor: colors.dangerBg },
  rewardText: { color: colors.streak, fontSize: 16, fontWeight: '700' },
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
  fill: { height: '100%', backgroundColor: colors.accent },
  secondary: { paddingVertical: spacing.sm },
  giveUp: { color: colors.danger, fontSize: 15, fontWeight: '500' },
  result: { alignItems: 'center', gap: spacing.sm },
  resultText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  primary: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
  },
  primaryText: { color: colors.onAccent, fontSize: 17, fontWeight: '600' },
}));
