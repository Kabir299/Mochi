import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HoldToCommit } from '@/components/HoldToCommit';
import { Pet } from '@/components/Pet';
import { PRIVACY_SHORT, PrivacyNote } from '@/components/PrivacyNote';
import { requestOnboardPlan, toPlanHabit } from '@/lib/ai';
import { formatDuration, formatMinute, toDateKey } from '@/lib/dates';
import { HABIT_ICONS } from '@/lib/icons';
import type { IconName } from '@/state/habits';
import {
  buildLocalPlan,
  DEFAULT_PROFILE,
  GOALS,
  OBSTACLES,
  PACES,
  parseProfile,
  PHYSIQUES,
  PlanHabit,
  Profile,
  suggestedTargets,
} from '@/lib/profile';
import { remindersSupported, requestReminderPermission } from '@/lib/reminders';
import { STARTER_HABITS } from '@/lib/starter';
import { useAccount } from '@/state/account';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { useRestoreBackup } from '@/state/useRestoreBackup';
import { colors, radius, spacing, themedStyles } from '@/theme';

const WAKE_TIMES = [300, 330, 360, 390, 420, 450, 480, 540, 600, 660];
const BED_TIMES = [1260, 1320, 1350, 1380, 1410, 0, 30, 60, 120];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Step = 'hello' | 'main' | 'extras' | 'body' | 'day' | 'quit' | 'pace' | 'plan' | 'commit';

// First launch: Mochi asks a few questions like a friend would, builds a plan around the
// answers, and they hold a thumbprint to commit to it. Also reachable from Settings → Redo
// setup. When and how long to work is asked in Plan my day.
export default function OnboardingScreen() {
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const settings = useSettings();
  const { habits, addHabit } = useHabits();
  const [profile, setProfile] = useState<Profile>(
    () => parseProfile(settings.profile) ?? DEFAULT_PROFILE,
  );
  const [name, setName] = useState(settings.shareName);
  const [index, setIndex] = useState(0);
  const [plan, setPlan] = useState<PlanHabit[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [summary, setSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(remindersSupported);
  const restoreBackup = useRestoreBackup();
  const account = useAccount();
  const [signingIn, setSigningIn] = useState(false);

  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
  const first = name.trim().split(' ')[0];
  const fitness = profile.goals.includes('workout') || profile.goals.includes('eat');
  const steps: Step[] = [
    'hello',
    'main',
    'extras',
    ...(fitness ? (['body'] as const) : []),
    'day',
    'quit',
    'pace',
    'plan',
    'commit',
  ];
  const step = steps[Math.min(index, steps.length - 1)];
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // The main goal is always one of the goals too.
  const pickMain = (id: Profile['goals'][number]) =>
    setProfile((p) => ({
      ...p,
      main: id,
      goals: [id, ...p.goals.filter((g) => g !== id && g !== p.main)],
    }));
  const toggleGoal = (id: Profile['goals'][number]) =>
    setProfile((p) => ({
      ...p,
      goals: p.goals.includes(id) ? p.goals.filter((g) => g !== id) : [...p.goals, id],
    }));
  const leave = () => {
    if (redo && router.canGoBack()) router.back();
    else router.replace('/');
  };

  const showPlan = (next: PlanHabit[], note: string) => {
    setPlan(next);
    setPicked(next.map(() => true));
    setSummary(note);
  };

  const next = () => {
    if (step === 'pace') {
      const local = buildLocalPlan(fitness ? profile : { ...profile, physique: 'none' });
      showPlan(
        local.length > 0 ? local : STARTER_HABITS.map((h) => ({ ...h, why: '' })),
        local.length > 0
          ? 'Built from your answers. Untick anything you don’t want; you can change it all later.'
          : 'You didn’t pick any goals, so here’s a simple day to start with.',
      );
      setAiError(null);
      // Forgetting is the reason they quit, so reminders start on.
      if (profile.obstacle === 'forget' && remindersSupported) setRemind(true);
    }
    setIndex((i) => i + 1);
  };

  const personalise = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await requestOnboardPlan({
        answers: profile,
        draft: plan.map((h) => ({
          name: h.name,
          days: h.days,
          start: h.startMinute,
          duration_min: h.durationMin,
          target: h.target,
        })),
        allowed_icons: HABIT_ICONS,
      });
      const mapped = result.habits.map(toPlanHabit);
      if (mapped.length > 0) showPlan(mapped, result.summary);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    const existing = new Set(habits.map((h) => h.name.trim().toLowerCase()));
    for (const [i, item] of plan.entries()) {
      if (!picked[i] || existing.has(item.name.trim().toLowerCase())) continue;
      const { why: _why, ...habit } = item;
      await addHabit(habit);
    }
    // Asked here, right after they've seen their plan, when it makes the most sense.
    const allowed = remind ? await requestReminderPermission() : false;
    await settings.update({
      ...suggestedTargets(profile),
      ...(allowed ? { remindersOn: true, reminderLead: 5 } : {}),
      ...(name.trim() ? { shareName: name.trim().slice(0, 40) } : {}),
      // Getting bored is why they quit, so they get someone to race.
      ...(profile.obstacle === 'bored' && !settings.aiBuddySince
        ? { aiBuddySince: toDateKey(new Date()) }
        : {}),
      onboarded: true,
      profile: JSON.stringify(profile),
    });
    leave();
  };

  const restore = async () => {
    if (await restoreBackup()) leave();
  };

  // Signing in on a new device brings the account's habits with it, so setup is skipped.
  const signIn = async () => {
    if (signingIn) return;
    setSigningIn(true);
    setAiError(null);
    try {
      await account.signIn();
    } catch {
      setAiError('Couldn’t reach Mochi’s server. Check your connection and try again.');
    } finally {
      setSigningIn(false);
    }
  };
  const arrived = !redo && account.account !== null && settings.onboarded;
  useEffect(() => {
    if (arrived) router.replace('/');
  }, [arrived]);

  const skip = async () => {
    if (habits.length === 0) for (const habit of STARTER_HABITS) await addHabit(habit);
    await settings.update({ onboarded: true });
    leave();
  };

  const count = picked.filter(Boolean).length;
  const targets = suggestedTargets(profile);
  const mainLabel = GOALS.find((g) => g.id === profile.main)?.label.toLowerCase();
  const obstacle = OBSTACLES.find((o) => o.id === profile.obstacle);

  const option = (on: boolean, label: string, hint: string | null, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <View style={styles.taskBody}>
        <Text style={[styles.optionText, on && styles.optionTextOn]}>{label}</Text>
        {hint && <Text style={styles.taskMeta}>{hint}</Text>}
      </View>
      {on && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
    </Pressable>
  );
  const chip = (on: boolean, label: string, onPress: () => void, icon?: IconName) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    >
      {icon && <Ionicons name={icon} size={16} color={on ? colors.onAccent : colors.textMuted} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        {index > 0 ? (
          <Pressable
            onPress={back}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.topSpacer} />
        )}
        <View style={styles.dots}>
          {steps.map((s, i) => (
            <View key={s} style={[styles.dot, i <= index && styles.dotOn]} />
          ))}
        </View>
        <Pressable onPress={redo ? leave : skip} hitSlop={10} accessibilityRole="button">
          <Text style={styles.skip}>{redo ? 'Cancel' : 'Skip'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'hello' && (
          <View style={styles.welcome}>
            <Pet mood="happy" />
            <Text style={styles.title}>Hey! I’m {settings.petName}.</Text>
            <Text style={styles.lead}>What should I call you?</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              maxLength={40}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={next}
              accessibilityLabel="Your name"
            />
            <PrivacyNote text={PRIVACY_SHORT} />
            {!redo && (
              <Pressable onPress={restore} hitSlop={8} accessibilityRole="button">
                <Text style={styles.restore}>New phone? Restore a backup</Text>
              </Pressable>
            )}
            {!redo && account.available && !account.account && (
              <Pressable onPress={signIn} hitSlop={8} accessibilityRole="button">
                <Text style={styles.restore}>
                  {signingIn ? 'Signing in…' : 'Have an account? Sign in with Google'}
                </Text>
              </Pressable>
            )}
            {aiError && <Text style={styles.error}>{aiError}</Text>}
          </View>
        )}

        {step === 'main' && (
          <>
            <Text style={styles.title}>
              {first ? `Nice to meet you, ${first}! ` : ''}What’s one thing you’d love to be better
              at a month from now?
            </Text>
            <View style={styles.chips}>
              {GOALS.map((g) => chip(profile.main === g.id, g.label, () => pickMain(g.id), g.icon))}
            </View>
            <TextInput
              value={profile.other}
              onChangeText={(other) => set({ other })}
              placeholder="Or type your own"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              maxLength={40}
              accessibilityLabel="Something else you want to get better at"
            />
          </>
        )}

        {step === 'extras' && (
          <>
            <Text style={styles.title}>Anything else you’d like to work on?</Text>
            <Text style={styles.lead}>Totally optional. I’ll fit these around your main goal.</Text>
            <View style={styles.chips}>
              {GOALS.filter((g) => g.id !== profile.main).map((g) =>
                chip(profile.goals.includes(g.id), g.label, () => toggleGoal(g.id), g.icon),
              )}
            </View>
          </>
        )}

        {step === 'body' && (
          <>
            <Text style={styles.title}>
              Are you trying to lose weight, build muscle, or just feel fitter?
            </Text>
            {PHYSIQUES.map((o) =>
              option(
                profile.physique === o.id,
                o.id === 'none' ? 'None of these' : o.label,
                o.id === 'none' ? null : o.hint,
                () => set({ physique: o.id }),
              ),
            )}
          </>
        )}

        {step === 'day' && (
          <>
            <Text style={styles.title}>What time do you usually get up?</Text>
            <View style={styles.chips}>
              {WAKE_TIMES.map((m) =>
                chip(profile.wakeMinute === m, formatMinute(m), () => set({ wakeMinute: m })),
              )}
            </View>
            <Text style={[styles.title, styles.second]}>And when do you crash?</Text>
            <View style={styles.chips}>
              {BED_TIMES.map((m) =>
                chip(profile.bedMinute === m, formatMinute(m), () => set({ bedMinute: m })),
              )}
            </View>
          </>
        )}

        {step === 'quit' && (
          <>
            <Text style={styles.title}>Be honest: what usually makes you quit a new habit?</Text>
            <Text style={styles.lead}>I’ll build your plan around it.</Text>
            {OBSTACLES.map((o) =>
              option(profile.obstacle === o.id, o.label, null, () => set({ obstacle: o.id })),
            )}
          </>
        )}

        {step === 'pace' && (
          <>
            <Text style={styles.title}>Last one: easy start, or are you all in?</Text>
            {PACES.map((o) =>
              option(profile.pace === o.id, o.label, o.hint, () => set({ pace: o.id })),
            )}
          </>
        )}

        {step === 'plan' && (
          <>
            <Text style={styles.title}>Here’s your plan{first ? `, ${first}` : ''}</Text>
            {summary !== '' && <Text style={styles.lead}>{summary}</Text>}
            {obstacle && (
              <View style={styles.tip}>
                <Ionicons name="bulb-outline" size={18} color={colors.streak} />
                <Text style={styles.tipText}>
                  You said “{obstacle.label}”. {obstacle.reply}
                </Text>
              </View>
            )}
            {plan.map((h, i) => (
              <Pressable
                key={`${h.name}-${i}`}
                onPress={() => setPicked((p) => p.map((v, j) => (j === i ? !v : v)))}
                style={[styles.task, picked[i] && styles.taskOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: picked[i] }}
              >
                <View style={[styles.check, picked[i] && styles.checkOn]}>
                  {picked[i] && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                </View>
                <Ionicons name={h.icon} size={16} color={colors.textMuted} />
                <View style={styles.taskBody}>
                  <Text style={styles.taskName}>{h.name}</Text>
                  <Text style={styles.taskMeta}>
                    {h.startMinute !== null
                      ? `${formatMinute(h.startMinute)} · ${formatDuration(h.durationMin ?? 30)}`
                      : 'Any time'}
                    {' · '}
                    {h.repeat === 'days' ? h.days.map((d) => WEEKDAY_NAMES[d]).join(' ') : 'Every day'}
                    {h.target > 1 ? ` · ${h.target} ${h.unit ?? 'times'}` : ''}
                  </Text>
                  {h.why !== '' && <Text style={styles.why}>{h.why}</Text>}
                </View>
              </Pressable>
            ))}

            <View style={styles.targets}>
              <Text style={styles.targetsTitle}>Daily targets</Text>
              <Text style={styles.taskMeta}>
                Streak counts when you finish {Math.round((targets.streakThreshold ?? 0.8) * 100)}%
                of the day
              </Text>
              {targets.calorieGoal !== undefined && (
                <Text style={styles.taskMeta}>
                  {targets.calorieGoal} kcal · {targets.proteinGoal} g protein ·{' '}
                  {((targets.waterGoalMl ?? 0) / 1000).toFixed(1)} L water
                </Text>
              )}
            </View>

            {remindersSupported ? (
              <View style={styles.remindRow}>
                <Ionicons name="notifications-outline" size={20} color={colors.accent} />
                <View style={styles.taskBody}>
                  <Text style={styles.taskName}>Remind me before each task</Text>
                  <Text style={styles.taskMeta}>
                    {settings.petName} will nudge you 5 minutes before it starts
                  </Text>
                </View>
                <Switch
                  value={remind}
                  onValueChange={setRemind}
                  trackColor={{ true: colors.accentDark, false: colors.border }}
                  thumbColor={remind ? colors.accent : colors.textMuted}
                />
              </View>
            ) : (
              <Text style={styles.hint}>
                {Platform.OS === 'web'
                  ? 'Reminders work in the phone app.'
                  : 'Reminders need the full app on Android; they can’t run inside Expo Go.'}
              </Text>
            )}

            {aiError && <Text style={styles.error}>{aiError}</Text>}
            {aiLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.taskMeta}>Tailoring your plan…</Text>
              </View>
            ) : (
              <Pressable onPress={personalise} style={styles.secondary}>
                <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
                <Text style={styles.secondaryText}>Personalise with AI</Text>
              </Pressable>
            )}
          </>
        )}
        {step === 'commit' && (
          <View style={styles.welcome}>
            <Text style={[styles.title, styles.center]}>Make it official{first ? `, ${first}` : ''}</Text>
            <View style={styles.pledge}>
              <Text style={styles.pledgeText}>
                {mainLabel
                  ? `I’m going to get better at ${mainLabel}. `
                  : profile.other.trim()
                    ? `I’m going to work on “${profile.other.trim()}”. `
                    : ''}
                I’ll show up for my {count === 1 ? 'habit' : `${count} habits`} every day, even
                when it’s just a little. Starting today.
              </Text>
            </View>
            <HoldToCommit onDone={finish} />
            <Text style={styles.hint}>Press and hold the circle like you’re giving a thumbprint.</Text>
          </View>
        )}
      </ScrollView>

      {step !== 'commit' && (
        <View style={styles.footer}>
          {step === 'plan' ? (
            <Pressable
              onPress={() => (count === 0 ? finish() : setIndex((i) => i + 1))}
              disabled={saving || aiLoading}
              style={[styles.button, (saving || aiLoading) && styles.disabled]}
            >
              <Text style={styles.buttonText}>
                {count === 0 ? 'Start with no habits' : `Start with ${count} ${count === 1 ? 'habit' : 'habits'}`}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={next} style={styles.button}>
              <Text style={styles.buttonText}>
                {step === 'hello' ? 'Let’s go' : step === 'extras' && profile.goals.length <= (profile.main ? 1 : 0) ? 'Skip' : 'Next'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.md,
  },
  topSpacer: {
    width: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
  skip: {
    color: colors.textMuted,
    fontSize: 15,
  },
  restore: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '500',
    marginTop: spacing.sm,
  },
  content: {
    padding: spacing.lg + 4,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  welcome: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl * 2,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  lead: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  second: {
    marginTop: spacing.lg,
  },
  center: {
    textAlign: 'center',
  },
  input: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionOn: {
    borderColor: colors.accent,
  },
  optionText: {
    color: colors.text,
    fontSize: 16,
  },
  optionTextOn: {
    fontWeight: '600',
  },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.proBg,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  tipText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  pledge: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  pledgeText: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
  },
  chipTextOn: {
    color: colors.onAccent,
    fontWeight: '600',
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
  why: {
    color: colors.accentLight,
    fontSize: 12,
    marginTop: 2,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  targets: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 4,
  },
  targetsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
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
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    padding: spacing.lg + 4,
    paddingTop: spacing.sm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
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
}));
