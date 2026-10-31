import { ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { ProLock } from '@/components/ProLock';
import { ChatMessage, requestChat } from '@/lib/ai';
import { useSettings } from '@/state/settings';
import { useAiPayload } from '@/state/useAiPayload';
import { colors, radius, spacing } from '@/theme';

const STARTERS = [
  'Why do I keep missing workouts?',
  'Which habit should I focus on this week?',
  'How can I make mornings easier?',
];

export default function CoachScreen() {
  const { isPro, petName } = useSettings();
  const payload = useAiPayload();
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
      const reply = await requestChat(next, payload());
      setMessages([...next, { role: 'coach', content: reply }]);
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
      {!isPro ? (
        <View style={styles.pad}>
          <ProLock
            title="Chat with your habit coach"
            body="Ask anything about your habits. The coach sees your streaks, completion rates and notes."
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
              <View
                key={i}
                style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}
              >
                <Text style={styles.bubbleText}>{m.content}</Text>
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
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
