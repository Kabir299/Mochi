import { useEffect, useMemo, useState } from 'react';
import {
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

import { KeyboardLift } from '@/components/KeyboardLift';
import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { Segmented } from '@/components/Segmented';
import { commonHabits, computeAiBuddy, weekAverage } from '@/lib/buddies';
import { BuddyLink, ShareChoice, ShareScope, timeAgo } from '@/lib/buddyLinks';
import { syncAvailable, syncErrorMessage } from '@/lib/buddySync';
import { confirmDestructive } from '@/lib/confirm';
import { lastNDays, toDateKey } from '@/lib/dates';
import { habitStats } from '@/lib/stats';
import { useToday } from '@/lib/useToday';
import { useBuddySync } from '@/state/buddySync';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const SHARE_OPTIONS = [
  ['all', 'All habits'],
  ['some', 'Choose habits'],
] as const;

// How often to look for news while this screen is open.
const REFRESH_MS = 30_000;

const percent = (value: number | null) => (value === null ? '–' : `${Math.round(value * 100)}%`);

export default function BuddiesScreen() {
  const settings = useSettings();
  const { habits, dayProgress, habitProgress } = useHabits();
  const sync = useBuddySync();
  const { syncNow } = sync;
  const today = useToday();
  const todayKey = toDateKey(today);

  // One-off tasks have no track record to compare.
  const shareable = useMemo(() => habits.filter((h) => h.repeat !== 'once'), [habits]);
  const [shareName, setShareName] = useState(settings.shareName);
  const [choice, setChoice] = useState<ShareChoice>({ scope: 'all', habitIds: [] });
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [buddyName, setBuddyName] = useState(settings.aiBuddyName);

  // Keeps "updated 5 min ago" true while the screen stays open.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    syncNow();
    const refresh = setInterval(() => {
      syncNow();
      setNow(Date.now());
    }, REFRESH_MS);
    return () => clearInterval(refresh);
  }, [syncNow]);

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

  // Checks what's needed to link with someone, and says what's missing.
  const readyToLink = () => {
    const name = shareName.trim();
    if (!name) {
      setMessage('Add your name so your buddy knows who you are.');
      return false;
    }
    if (choice.scope === 'some' && choice.habitIds.length === 0) {
      setMessage('Pick at least one habit to share.');
      return false;
    }
    setMessage(null);
    if (name !== settings.shareName) settings.update({ shareName: name });
    return true;
  };

  const sendInvite = async (code: string) => {
    const name = shareName.trim() || settings.shareName;
    const text = `${name} wants to be your Mochi buddy. In Mochi, open Progress → Buddies and paste this message. The invite works once and lasts 7 days.\n\n${code}`;
    try {
      await Share.share({ message: text });
    } catch {
      // No share sheet here; the invite stays on screen to copy.
    }
  };

  const invite = async () => {
    if (busy || !readyToLink()) return;
    setBusy(true);
    try {
      await sendInvite(await sync.createInvite(choice));
    } catch (e) {
      setMessage(syncErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (busy || !readyToLink()) return;
    setBusy(true);
    try {
      await sync.joinInvite(pasted, choice);
      setPasted('');
      setMessage('You’re linked! Their progress appears here after their next update.');
    } catch (e) {
      setMessage(syncErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (link: BuddyLink) => {
    const name = link.buddy?.name;
    const ok = await confirmDestructive(
      link.joined ? `Remove ${name ?? 'this buddy'}?` : 'Cancel this invite?',
      link.joined
        ? 'You’ll both stop seeing each other’s progress, and your updates are deleted from the server.'
        : 'The invite stops working, even if it’s already been sent.',
      link.joined ? 'Remove' : 'Cancel invite',
    );
    if (ok) sync.removeLink(link.id);
  };

  const joined = sync.links.filter((l) => l.joined);
  const pending = sync.links.filter((l) => !l.joined);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardLift style={styles.flex}>
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
            {joined.length === 0 && pending.length === 0 && (
              <Text style={styles.muted}>
                Invite a friend and see each other’s progress update by itself as you both tick
                things off.
              </Text>
            )}
            {sync.offline && sync.links.length > 0 && (
              <Text style={styles.warning}>Can’t reach the server. Showing the last update.</Text>
            )}
            {joined.map((link) => {
              const buddy = link.buddy;
              const name = buddy?.name ?? 'Your buddy';
              const common = buddy ? commonHabits(habits, buddy) : [];
              return (
                <View key={link.id} style={styles.buddy}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.buddyName}>{name}</Text>
                    <Pressable
                      onPress={() => remove(link)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${name}`}
                    >
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  {!buddy ? (
                    <Text style={styles.muted}>Linked. Waiting for their first update.</Text>
                  ) : (
                    <>
                      <Text style={styles.muted}>
                        {buddy.streak} day streak · updated {timeAgo(link.receivedAt, now)}
                      </Text>
                      <Compare
                        label="This week"
                        you={myAverage}
                        them={weekAverage(buddy.week)}
                        name={name}
                      />
                      {common.length > 0 && <Text style={styles.label}>Habits you share</Text>}
                      {common.map(({ mine, theirs }) => (
                        <Compare
                          key={theirs.name}
                          label={theirs.name}
                          you={rates.get(mine.id) ?? 0}
                          them={theirs.rate}
                          name={name}
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
                    </>
                  )}
                  <Pressable
                    onPress={() => setEditing(editing === link.id ? null : link.id)}
                    style={styles.rowBetween}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: editing === link.id }}
                  >
                    <Text style={styles.link}>
                      {buddy ? `What ${name.split(' ')[0]} sees` : 'What they see'}
                    </Text>
                    <Text style={styles.muted}>
                      {link.scope === 'all'
                        ? 'All habits'
                        : `${link.habitIds.length} habit${link.habitIds.length === 1 ? '' : 's'}`}
                    </Text>
                  </Pressable>
                  {editing === link.id && (
                    <ShareChooser
                      habits={shareable}
                      value={link}
                      onChange={(next) => sync.setShare(link.id, next)}
                    />
                  )}
                </View>
              );
            })}
            {pending.map((link) => (
              <View key={link.id} style={styles.buddy}>
                <View style={styles.rowBetween}>
                  <Text style={styles.buddyName}>Invite sent</Text>
                  <Pressable
                    onPress={() => remove(link)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel invite"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={styles.muted}>Waiting for your friend to join.</Text>
                {link.code && (
                  <>
                    <Text selectable numberOfLines={2} style={styles.code}>
                      {link.code}
                    </Text>
                    <Pressable
                      onPress={() => sendInvite(link.code!)}
                      hitSlop={6}
                      accessibilityRole="button"
                    >
                      <Text style={styles.link}>Send again</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add a buddy</Text>
            {!syncAvailable ? (
              <Text style={styles.muted}>Live buddies aren’t set up in this version of Mochi.</Text>
            ) : (
              <>
                <TextInput
                  value={shareName}
                  onChangeText={(text) => {
                    setShareName(text);
                    setMessage(null);
                  }}
                  placeholder="Your name"
                  placeholderTextColor={colors.iconMuted}
                  style={styles.input}
                  maxLength={40}
                  accessibilityLabel="Your name"
                />
                <Text style={styles.muted}>
                  They’ll see your name, overall progress and streak for the week, plus these habits,
                  never notes or times. You can change this later for each buddy.
                </Text>
                <ShareChooser habits={shareable} value={choice} onChange={setChoice} />
                <Pressable
                  onPress={invite}
                  disabled={busy}
                  style={[styles.primary, busy && styles.disabled]}
                  accessibilityRole="button"
                >
                  <Ionicons name="share-social-outline" size={18} color={colors.onAccent} />
                  <Text style={styles.primaryText}>Invite a friend</Text>
                </Pressable>
                <TextInput
                  value={pasted}
                  onChangeText={(text) => {
                    setPasted(text);
                    setMessage(null);
                  }}
                  placeholder="Or paste a friend’s invite"
                  placeholderTextColor={colors.iconMuted}
                  style={styles.input}
                  multiline
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Friend’s invite"
                />
                <Pressable
                  onPress={join}
                  disabled={busy || pasted.trim() === ''}
                  style={[styles.secondary, (busy || pasted.trim() === '') && styles.disabled]}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>Link with friend</Text>
                </Pressable>
              </>
            )}
          </View>
          {message && <Text style={styles.message}>{message}</Text>}
        </ScrollView>
      </KeyboardLift>
    </SafeAreaView>
  );
}

function ShareChooser({
  habits,
  value,
  onChange,
}: {
  habits: { id: number; name: string }[];
  value: ShareChoice;
  onChange: (next: ShareChoice) => void;
}) {
  return (
    <>
      <Segmented
        options={SHARE_OPTIONS}
        value={value.scope}
        onChange={(scope: ShareScope) => onChange({ scope, habitIds: value.habitIds })}
      />
      {value.scope === 'some' && (
        <View style={styles.chips}>
          {habits.map((h) => {
            const on = value.habitIds.includes(h.id);
            return (
              <Pressable
                key={h.id}
                onPress={() =>
                  onChange({
                    scope: 'some',
                    habitIds: on
                      ? value.habitIds.filter((id) => id !== h.id)
                      : [...value.habitIds, h.id],
                  })
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
    </>
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
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  warning: {
    color: colors.streak,
    fontSize: 13,
  },
  message: {
    color: colors.streak,
    fontSize: 14,
    textAlign: 'center',
  },
}));
