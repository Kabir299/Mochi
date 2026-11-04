import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IconName } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

type Choice = 'trackFood' | 'trackWater' | 'trackGym';

const CHOICES: { key: Choice; icon: IconName; title: string; body: string; pro?: boolean }[] = [
  {
    key: 'trackWater',
    icon: 'water-outline',
    title: 'Water',
    body: 'One tap per glass, against a daily goal.',
  },
  {
    key: 'trackGym',
    icon: 'barbell-outline',
    title: 'Gym sessions',
    body: 'Log a session and see your week.',
  },
  {
    key: 'trackFood',
    icon: 'restaurant-outline',
    title: 'Calories',
    body: 'Log meals with calories and protein.',
    pro: true,
  },
];

// "What do you want to track?" The Health tab then shows only what's ticked. Asked on the
// first visit and reopened from the tab; turning something off keeps its history.
export function TrackPicker({ onDone }: { onDone: () => void }) {
  const settings = useSettings();
  const { water, food, gym } = useNutrition();
  // On the first ask, anything already logged starts ticked.
  const asked = settings.trackAsked;
  const [picked, setPicked] = useState<Record<Choice, boolean>>({
    trackFood: settings.trackFood || (!asked && food.length > 0),
    trackWater: settings.trackWater || (!asked && water.length > 0),
    trackGym: settings.trackGym || (!asked && gym.length > 0),
  });

  const save = async (choices: Record<Choice, boolean>) => {
    await settings.update({ ...choices, trackAsked: true });
    onDone();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>What do you want to track?</Text>
      <Text style={styles.body}>I’ll only show what you pick. You can change it any time.</Text>
      {CHOICES.map((c) => {
        const on = picked[c.key];
        return (
          <Pressable
            key={c.key}
            onPress={() => setPicked((p) => ({ ...p, [c.key]: !on }))}
            style={[styles.choice, on && styles.choiceOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Ionicons name={c.icon} size={22} color={on ? colors.accent : colors.textMuted} />
            <View style={styles.choiceBody}>
              <View style={styles.choiceHead}>
                <Text style={styles.choiceTitle}>{c.title}</Text>
                {c.pro && !settings.isPro && <Text style={styles.proBadge}>PRO</Text>}
              </View>
              <Text style={styles.choiceText}>{c.body}</Text>
            </View>
            <Ionicons
              name={on ? 'checkbox' : 'square-outline'}
              size={22}
              color={on ? colors.accent : colors.textMuted}
            />
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => save(picked)}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.background,
    padding: spacing.md,
  },
  choiceOn: {
    borderColor: colors.accent,
  },
  choiceBody: {
    flex: 1,
    gap: 2,
  },
  choiceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  choiceTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  choiceText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  proBadge: {
    color: colors.streak,
    backgroundColor: colors.proBg,
    fontSize: 10,
    fontWeight: '700',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
