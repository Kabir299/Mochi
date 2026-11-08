import { ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardLift } from '@/components/KeyboardLift';
import { ModalHeader } from '@/components/ModalHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { ProLock } from '@/components/ProLock';
import { ChatMessage, requestChat } from '@/lib/ai';
import { formatDuration, formatMinute } from '@/lib/dates';
import type { PlanHabit } from '@/lib/profile';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { useAiPayload } from '@/state/useAiPayload';
import { colors, radius, spacing, themedStyles } from '@/theme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describe(habit: PlanHabit) {
  const when = habit.repeat === 'days' ? habit.days.map((d) => WEEKDAYS[d]).join(' ') : 'Every day';
  const time =
    habit.startMinute === null
      ? 'Any time'
      : `${formatMinute(habit.startMinute)} · ${formatDuration(habit.durationMin ?? 30)}`;
  const goal = habit.target > 1 ? ` · ${habit.target} ${habit.unit ?? 'times'}` : '';
  return `${time} · ${when}${goal}`;
}

const STARTERS = [
  'Why do I keep missing workouts?',
  'Which habit should I focus on this week?',
  'How can I make mornings easier?',
];

export default function CoachScreen() {
  const { isPro, petName } = useSettings();
  const payload = useAiPayload();
  const { habits, addHabit } = useHabits();
  const have = new Set(habits.map((h) => h.name.trim().toLowerCase()));
  const [adding, setAdding] = useState<string | null>(null);

  const add = async (habit: PlanHabit) => {
    if (adding) return;
    setAdding(habit.name);
    try {
      const { why: _why, ...input } = habit;
      await addHabit(input);
    } catch {
      setError('Couldn’t add that habit. Try again.');
    } finally {
      setAdding(null);
    }
  };
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setError(null);
    setLoading(true);
    try {
      const { reply, habits: offered } = await requestChat(next, payload());
      setMessages([...next, { role: 'coach', content: reply, habits: offered }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Coach" />
      <PrivacyNote />
      {!isPro ? (
        <View style={styles.pad}>
          <ProLock
            title="Chat with your habit coach"
            body="Ask anything about your habits. The coach sees your streaks, completion rates and notes."
          />
        </View>
      ) : (
        <KeyboardLift style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={styles.intro}>
                <Text style={styles.introText}>
                  Hi! I can see your habits and streaks. Ask me anything, or try one of these:
                </Text>
                {STARTERS.map((s) => (
                  <Pressable key={s} onPress={() => send(s)} style={styles.starter}>
                    <Text style={styles.starterText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {messages.map((m, i) => (
              <View key={i} style={styles.turn}>
                <View style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}>
                  <Text style={styles.bubbleText}>{m.content}</Text>
                </View>
                {m.habits?.map((habit) => {
                  const added = have.has(habit.name.trim().toLowerCase());
                  return (
                    <View key={habit.name} style={styles.offer}>
                      <View style={styles.offerText}>
                        <Text style={styles.offerName}>{habit.name}</Text>
                        <Text style={styles.offerMeta}>{describe(habit)}</Text>
                        {habit.why !== '' && <Text style={styles.offerMeta}>{habit.why}</Text>}
                      </View>
                      <Pressable
                        onPress={() => add(habit)}
                        disabled={added || adding !== null}
                        style={[styles.addButton, added && styles.added]}
                        accessibilityRole="button"
                        accessibilityLabel={added ? `${habit.name} added` : `Add ${habit.name}`}
                      >
                        <Ionicons
                          name={added ? 'checkmark' : 'add'}
                          size={16}
                          color={added ? colors.accent : colors.onAccent}
                        />
                        <Text style={[styles.addText, added && styles.addedText]}>
                          {added ? 'Added' : 'Add'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
            {loading && (
              <View style={[styles.bubble, styles.theirs, styles.typing]}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.typingText}>Thinking…</Text>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Ask about your habits or ${petName}`}
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              multiline
              maxLength={500}
            />
            <Pressable
              onPress={() => send(draft)}
              style={[styles.sendButton, (!draft.trim() || loading) && styles.sendDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Ionicons name="arrow-up" size={20} color={colors.onAccent} />
            </Pressable>
          </View>
        </KeyboardLift>
      )}
    </SafeAreaView>
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
  pad: {
    padding: spacing.lg + 4,
  },
  messages: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  intro: {
    gap: spacing.sm,
  },
  introText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: spacing.xs,
  },
  starter: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  starterText: {
    color: colors.accentLight,
    fontSize: 14,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.card + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentDark,
    borderBottomRightRadius: 4,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderBottomLeftRadius: 4,
  },
  turn: {
    gap: spacing.sm,
  },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.accentDark,
    padding: spacing.md,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  offerText: {
    flexShrink: 1,
    gap: 2,
  },
  offerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  offerMeta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  added: {
    backgroundColor: 'transparent',
  },
  addText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  addedText: {
    color: colors.accent,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxHeight: 120,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
}));
