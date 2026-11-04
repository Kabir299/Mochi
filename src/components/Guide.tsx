import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Pet } from '@/components/Pet';
import { IconName } from '@/state/habits';
import { colors, radius, spacing } from '@/theme';

export type GuideStep = { icon: IconName; title: string; body: string };

// A short walkthrough with the pet, one card at a time. Always skippable.
export function Guide({ steps, onDone }: { steps: GuideStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pet mood="happy" />
          <View style={styles.head}>
            <Ionicons name={step.icon} size={20} color={colors.accent} />
            <Text style={styles.title}>{step.title}</Text>
          </View>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
          <View style={styles.buttons}>
            {!last && (
              <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button">
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => (last ? onDone() : setIndex(index + 1))}
              style={({ pressed }) => [styles.next, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.nextText}>{last ? 'Got it' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotOn: {
    backgroundColor: colors.accent,
  },
  buttons: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.lg,
  },
  skip: {
    color: colors.textMuted,
    fontSize: 15,
  },
  next: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
  },
  nextText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
