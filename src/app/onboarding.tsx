import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Pet } from '@/components/Pet';
import { PRIVACY_SHORT, PrivacyNote } from '@/components/PrivacyNote';
import { requestOnboardPlan, timeToMinute } from '@/lib/ai';
import { formatDuration, formatMinute } from '@/lib/dates';
import { HABIT_ICONS } from '@/lib/icons';
import {
  buildLocalPlan,
  DEFAULT_PROFILE,
  GOALS,
  PACES,
  parseProfile,
  PlanHabit,
  Profile,
  suggestedTargets,
} from '@/lib/profile';
import { remindersSupported, requestReminderPermission } from '@/lib/reminders';
import { STARTER_HABITS } from '@/lib/starter';
import { IconName, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const WAKE_TIMES = [300, 330, 360, 390, 420, 450, 480, 540, 600];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FALLBACK_ICON: IconName = 'checkmark-circle-outline';
const STEPS = 3;

// First launch: a few questions about the person, then a starting plan built
// around them. Also reachable from Settings → Redo setup. The body goal is asked on
// the Nutrition tab, and when / how long to work in Plan my day.
export default function OnboardingScreen() {
  const { redo } = useLocalSearchParams<{ redo?: string }>();
  const settings = useSettings();
  const { habits, addHabit } = useHabits();
  const [profile, setProfile] = useState<Profile>(
    () => parseProfile(settings.profile) ?? DEFAULT_PROFILE,
  );
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<PlanHabit[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [summary, setSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(remindersSupported);

  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
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
    if (step === STEPS - 1) {
      const local = buildLocalPlan(profile);
      showPlan(
        local.length > 0 ? local : STARTER_HABITS.map((h) => ({ ...h, why: '' })),
        local.length > 0
          ? 'Built from your answers. Untick anything you don’t want; you can change it all later.'
          : 'You didn’t pick any goals, so here’s a simple day to start with.',
      );
      setAiError(null);
    }
    setStep((s) => s + 1);
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
      const mapped: PlanHabit[] = result.habits.map((h) => {
        const start = timeToMinute(h.start_time);
        const days = [...new Set(h.days.filter((d) => d >= 0 && d <= 6))].sort();
        const target = Math.min(99, Math.max(1, Math.round(h.target || 1)));
        return {
          name: h.name.slice(0, 40),
          icon: (HABIT_ICONS as string[]).includes(h.icon) ? (h.icon as IconName) : FALLBACK_ICON,
          target,
          unit: target > 1 ? h.unit : null,
          repeat: days.length > 0 && days.length < 7 ? 'days' : 'daily',
          days: days.length < 7 ? days : [],
          weight: Math.min(3, Math.max(1, Math.round(h.weight || 2))),
          startMinute: start,
          durationMin: start === null ? null : Math.max(5, h.duration_min ?? 30),
          onceDay: null,
          why: h.why,
        };
      });
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
      onboarded: true,
      profile: JSON.stringify(profile),
    });
    leave();
  };

  const skip = async () => {
    if (habits.length === 0) for (const habit of STARTER_HABITS) await addHabit(habit);
    await settings.update({ onboarded: true });
    leave();
  };

  const count = picked.filter(Boolean).length;
  const targets = suggestedTargets(profile);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        {step > 0 ? (
          <Pressable
            onPress={() => setStep((s) => s - 1)}
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
          {Array.from({ length: STEPS + 1 }, (_, i) => (
            <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />
          ))}
        </View>
        <Pressable onPress={redo ? leave : skip} hitSlop={10} accessibilityRole="button">
          <Text style={styles.skip}>{redo ? 'Cancel' : 'Skip'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View style={styles.welcome}>
            <Pet mood="happy" />
            <Text style={styles.title}>Hi, I’m {settings.petName}!</Text>
            <Text style={styles.lead}>
              Answer a few quick questions and I’ll build your first plan around your goals.
            </Text>
            <PrivacyNote text={PRIVACY_SHORT} />
          </View>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>Which habits do you want to build?</Text>
            <Text style={styles.lead}>Pick as many as you like.</Text>
            <View style={styles.chips}>
              {GOALS.map((g) => {
                const on = profile.goals.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    onPress={() =>
                      setProfile((p) => ({
                        ...p,
                        goals: p.goals.includes(g.id)
                          ? p.goals.filter((id) => id !== g.id)
                          : [...p.goals, g.id],
                      }))
                    }
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Ionicons
                      name={g.icon}
                      size={16}
                      color={on ? colors.onAccent : colors.textMuted}
                    />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>Anything else?</Text>
            <TextInput
              value={profile.other}
              onChangeText={(other) => set({ other })}
              placeholder="e.g. practise guitar, call my parents"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              maxLength={200}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>What does your day look like?</Text>
            <Text style={styles.label}>I usually wake up at</Text>
            <View style={styles.chips}>
              {WAKE_TIMES.map((m) => {
                const on = profile.wakeMinute === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => set({ wakeMinute: m })}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {formatMinute(m)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>Pace</Text>
            {PACES.map((o) => (
              <OptionCard
                key={o.id}
                label={o.label}
                hint={o.hint}
                on={profile.pace === o.id}
                onPress={() => set({ pace: o.id })}
              />
            ))}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Your starting plan</Text>
            {summary !== '' && <Text style={styles.lead}>{summary}</Text>}
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
      </ScrollView>

      <View style={styles.footer}>
        {step < STEPS ? (
          <Pressable onPress={next} style={styles.button}>
            <Text style={styles.buttonText}>{step === 0 ? 'Let’s go' : 'Next'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={finish}
            disabled={saving || aiLoading}
            style={[styles.button, (saving || aiLoading) && styles.disabled]}
          >
            <Text style={styles.buttonText}>
              {count === 0 ? 'Start with no habits' : `Start with ${count} ${count === 1 ? 'habit' : 'habits'}`}
            </Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function OptionCard({
  label,
  hint,
  on,
  onPress,
}: {
  label: string;
  hint: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <View style={styles.taskBody}>
        <Text style={styles.taskName}>{label}</Text>
        <Text style={styles.taskMeta}>{hint}</Text>
      </View>
      <Ionicons
        name={on ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={on ? colors.accent : colors.iconMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    padding: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionOn: {
    borderColor: colors.accent,
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
});
