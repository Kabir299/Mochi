import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { Segmented } from '@/components/Segmented';
import {
  addBuddy,
  commonHabits,
  computeAiBuddy,
  decodeSnapshot,
  encodeSnapshot,
  parseBuddies,
  weekAverage,
} from '@/lib/buddies';
import { confirmDestructive } from '@/lib/confirm';
import { lastNDays, toDateKey } from '@/lib/dates';
import { habitStats } from '@/lib/stats';
import { computeDayStreak, streakProgress } from '@/lib/streak';
import { useToday } from '@/lib/useToday';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const SHARE_OPTIONS = [
  ['all', 'All habits'],
  ['some', 'Choose habits'],
] as const;

const percent = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);

export default function BuddiesScreen() {
  const settings = useSettings();
  const { habits, dayProgress, habitProgress, firstDay, streakFor } = useHabits();
  const today = useToday();
  const todayKey = toDateKey(today);

  const buddies = useMemo(() => parseBuddies(settings.buddies), [settings.buddies]);
  // One-off tasks have no track record to compare.
  const shareable = useMemo(() => habits.filter((h) => h.repeat !== 'once'), [habits]);
  const [shareName, setShareName] = useState(settings.shareName);
  const [scope, setScope] = useState<'all' | 'some'>('all');
  const [picked, setPicked] = useState<number[]>([]);
  const [code, setCode] = useState('');
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [buddyName, setBuddyName] = useState(settings.aiBuddyName);

  const streakNow = computeDayStreak(
    firstDay,
    today,
    streakProgress(dayProgress, {
      repairedDays: settings.repairedDays,
      restDays: settings.isPro ? settings.restDays : '',
      threshold: settings.streakThreshold,
    }),
    settings.streakThreshold,
    settings.freezesPerMonth,
  ).current;

  const myWeek = lastNDays(today, 7).map((d) => dayProgress(toDateKey(d)));
  const myAverage = weekAverage(myWeek);
  const myToday = dayProgress(todayKey);

  const aiOn = settings.aiBuddySince !== '';
  const ai = aiOn
    ? computeAiBuddy(settings.aiBuddySince, today, dayProgress, settings.streakThreshold)
    : null;

  const toggleAi = (on: boolean) =>
    settings.update({ aiBuddySince: on ? todayKey : '' });

  const aiLine = () => {
    if (!ai) return '';
    const name = settings.aiBuddyName;
    if (myToday === null) return `${name} is aiming for ${percent(ai.today)} today.`;
    const gap = Math.round((ai.today - myToday) * 100);
    if (gap <= 0) return `You’re ahead of ${name} today. Keep it up!`;
    return `${gap}% more today and you’ll catch ${name}.`;
  };

  const rates = useMemo(() => {
    const stats = habitStats(today, 7, { habits, dayProgress, habitProgress });
    return new Map(stats.map((s) => [s.habit.id, s.rate ?? 0]));
  }, [today, habits, dayProgress, habitProgress]);

  const share = async () => {
    const name = shareName.trim();
    if (!name) return setMessage('Add your name so your buddy knows who it’s from.');
    const chosen = scope === 'all' ? shareable : shareable.filter((h) => picked.includes(h.id));
    if (chosen.length === 0) return setMessage('Pick at least one habit to share.');
    setMessage(null);
    if (name !== settings.shareName) settings.update({ shareName: name });
    const next = encodeSnapshot({
      name,
      day: todayKey,
      streak: streakNow,
      week: myWeek,
      habits: chosen.map((h) => ({
        name: h.name,
        rate: rates.get(h.id) ?? 0,
        streak: streakFor(h, today),
      })),
    });
    setCode(next);
    const text = `${name} is sharing their Mochi progress with you. In Mochi, open Progress → Buddies and paste this message:\n\n${next}`;
    try {
      await Share.share({ message: text });
    } catch {
      // No share sheet here; the code stays on screen to copy.
    }
  };

  const add = () => {
    const buddy = decodeSnapshot(pasted);
    if (!buddy) return setMessage('That doesn’t look like a Mochi buddy code.');
    settings.update({ buddies: JSON.stringify(addBuddy(buddies, buddy)) });
    setPasted('');
    setMessage(`${buddy.name} added.`);
  };

  const remove = async (name: string) => {
    const ok = await confirmDestructive(
      `Remove ${name}?`,
      'Their progress is removed from this phone.',
      'Remove',
    );
    if (!ok) return;
    settings.update({ buddies: JSON.stringify(buddies.filter((b) => b.name !== name)) });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ModalHeader title="Buddies" leftLabel="Close" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>AI buddy</Text>
                <Text style={styles.muted}>Grows with you and stays just ahead of your pace.</Text>
              </View>
              <Switch
                value={aiOn}
                onValueChange={toggleAi}
                trackColor={{ true: colors.accentDark, false: colors.border }}
                thumbColor={aiOn ? colors.accent : colors.textMuted}
                accessibilityLabel="AI buddy"
              />
            </View>
            {ai && (
              <>
                <View style={styles.aiHead}>
                  <Pet mood="happy" streak={ai.streak} />
                  <View style={styles.flex}>
                    <TextInput
                      value={buddyName}
                      onChangeText={setBuddyName}
                      onEndEditing={() =>
                        settings.update({ aiBuddyName: buddyName.trim() || 'Kumo' })
                      }
                      style={styles.aiName}
                      maxLength={20}
                      accessibilityLabel="AI buddy name"
                    />
                    <Text style={styles.muted}>
                      Level {ai.level} · {ai.streak} day streak
                    </Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${ai.toNextLevel * 100}%` }]} />
                    </View>
                  </View>
                </View>
                <Compare label="Today" you={myToday} them={ai.today} name={settings.aiBuddyName} />
                <Compare
                  label="This week"
                  you={myAverage}
                  them={ai.weekAverage}
                  name={settings.aiBuddyName}
                />
                <Text style={styles.line}>{aiLine()}</Text>
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your buddies</Text>
            {buddies.length === 0 ? (
              <Text style={styles.muted}>
                Share your code with a friend and paste theirs below to see each other’s progress.
              </Text>
            ) : (
              buddies.map((buddy) => {
                const common = commonHabits(habits, buddy);
                return (
                  <View key={buddy.name} style={styles.buddy}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.buddyName}>{buddy.name}</Text>
                      <Pressable
                        onPress={() => remove(buddy.name)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${buddy.name}`}
                      >
                        <Ionicons name="close" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                    <Text style={styles.muted}>
                      {buddy.streak} day streak · updated {buddy.day}
                    </Text>
                    <Compare
                      label="This week"
                      you={myAverage}
                      them={weekAverage(buddy.week)}
                      name={buddy.name}
                    />
                    {common.length > 0 && <Text style={styles.label}>Habits you share</Text>}
                    {common.map(({ mine, theirs }) => (
                      <Compare
                        key={theirs.name}
                        label={theirs.name}
                        you={rates.get(mine.id) ?? 0}
                        them={theirs.rate}
                        name={buddy.name}
                      />
                    ))}
                    {buddy.habits
                      .filter((h) => !common.some((c) => c.theirs.name === h.name))
                      .map((h) => (
                        <View key={h.name} style={styles.rowBetween}>
                          <Text style={styles.habit}>{h.name}</Text>
                          <Text style={styles.muted}>
                            {percent(h.rate)} · {h.streak}d
                          </Text>
                        </View>
                      ))}
                  </View>
                );
              })
            )}
            <TextInput
              value={pasted}
              onChangeText={(t) => {
                setPasted(t);
                setMessage(null);
              }}
              placeholder="Paste a buddy’s code"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Buddy code"
            />
            <Pressable
              onPress={add}
              disabled={pasted.trim() === ''}
              style={[styles.secondary, pasted.trim() === '' && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Add buddy</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Share my progress</Text>
            <Text style={styles.muted}>
              You choose what goes and who gets it. Your buddy sees this week’s progress and streaks,
              never notes or times. Share again to update them.
            </Text>
            <TextInput
              value={shareName}
              onChangeText={setShareName}
              placeholder="Your name"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              maxLength={40}
              accessibilityLabel="Your name"
            />
            <Segmented options={SHARE_OPTIONS} value={scope} onChange={setScope} />
            {scope === 'some' && (
              <View style={styles.chips}>
                {shareable.map((h) => {
                  const on = picked.includes(h.id);
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() =>
                        setPicked((p) => (on ? p.filter((id) => id !== h.id) : [...p, h.id]))
                      }
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{h.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Pressable onPress={share} style={styles.primary} accessibilityRole="button">
              <Ionicons name="share-social-outline" size={18} color={colors.onAccent} />
              <Text style={styles.primaryText}>Share with a buddy</Text>
            </Pressable>
            {code !== '' && (
              <Text selectable numberOfLines={3} style={styles.code}>
                {code}
              </Text>
            )}
          </View>
          {message && <Text style={styles.message}>{message}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Compare({
  label,
  you,
  them,
  name,
}: {
  label: string;
  you: number | null;
  them: number | null;
  name: string;
}) {
  return (
    <View style={styles.compare}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.bars}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(you ?? 0) * 100}%` }]} />
        </View>
        <Text style={styles.value} numberOfLines={1}>
          You {percent(you)}
        </Text>
      </View>
      <View style={styles.bars}>
        <View style={styles.track}>
          <View style={[styles.fillThem, { width: `${(them ?? 0) * 100}%` }]} />
        </View>
        <Text style={styles.value} numberOfLines={1}>
          {name.split(' ')[0]} {percent(them)}
        </Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  aiHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  aiName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    padding: 0,
  },
  track: {
    flex: 1,
    height: 6,
    minHeight: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  fillThem: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.water,
  },
  compare: {
    gap: 4,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  value: {
    color: colors.textMuted,
    fontSize: 12,
    width: 96,
    textAlign: 'right',
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  line: {
    color: colors.accentLight,
    fontSize: 14,
  },
  buddy: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  buddyName: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  habit: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
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
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
  },
  primaryText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  secondary: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  code: {
    color: colors.textMuted,
    fontSize: 11,
  },
  message: {
    color: colors.streak,
    fontSize: 14,
    textAlign: 'center',
  },
}));
