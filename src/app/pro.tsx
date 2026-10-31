import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { closeModal } from '@/lib/nav';
import { ModalHeader } from '@/components/ModalHeader';
import { IconName } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'sparkles-outline',
    title: 'AI analysis',
    body: 'A personal review of your habits with specific tips to improve.',
  },
  {
    icon: 'water-outline',
    title: 'Water tracking',
    body: 'One-tap glasses, a daily goal and your 7-day history.',
  },
  {
    icon: 'restaurant-outline',
    title: 'Food tracking',
    body: 'Log meals with calories and protein against your daily goals.',
  },
];

export default function ProScreen() {
  const { isPro, update } = useSettings();

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Pro" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="diamond-outline" size={30} color={colors.streak} />
          </View>
          <Text style={styles.title}>Habit Tracker Pro</Text>
          <Text style={styles.subtitle}>
            Go beyond checkboxes and see what actually moves you forward.
          </Text>
        </View>

        <View style={styles.card}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <Ionicons name={f.icon} size={22} color={colors.accent} />
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureText}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={async () => {
            await update({ isPro: !isPro });
            if (!isPro) closeModal();
          }}
          style={({ pressed }) => [
            isPro ? styles.secondaryButton : styles.button,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={isPro ? styles.secondaryText : styles.buttonText}>
            {isPro ? 'Turn off Pro' : 'Unlock Pro'}
          </Text>
        </Pressable>
        <Text style={styles.note}>
          Test mode: Pro unlocks for free on this device. Real App Store and Play Store purchases
          get connected before release.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.proBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  feature: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  featureBody: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  featureText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
  note: {
    color: colors.iconMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
