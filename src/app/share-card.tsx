import { ComponentRef, useRef, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { lastNDays, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/useToday';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// A picture of your week with the pet, sized for stories and chats.
export default function ShareCardScreen() {
  const { best: bestParam, current: currentParam } = useLocalSearchParams<{
    best?: string;
    current?: string;
  }>();
  const best = Number(bestParam) || 0;
  const current = Number(currentParam) || 0;
  const settings = useSettings();
  const { dayProgress } = useHabits();
  const today = useToday();
  const card = useRef<ComponentRef<typeof View>>(null);
  const [error, setError] = useState<string | null>(null);

  const week = lastNDays(today, 7).map((d) => ({
    date: d,
    value: dayProgress(toDateKey(d)),
  }));
  const tracked = week.filter((d) => d.value !== null);
  const average = tracked.length
    ? Math.round((tracked.reduce((s, d) => s + (d.value ?? 0), 0) / tracked.length) * 100)
    : 0;
  const text = `${current}-day streak with ${settings.petName}! ${average}% of my habits done this week.`;

  const share = async () => {
    setError(null);
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        await Share.share({ message: text });
        return;
      }
      const uri = await captureRef(card, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your week' });
    } catch {
      setError('Couldn’t make the picture. Try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Share" />
      <View style={styles.content}>
        <View ref={card} collapsable={false} style={styles.card}>
          <Text style={styles.brand}>Habit Tracker</Text>
          <View style={styles.pet}>
            <Pet mood="ecstatic" streak={best} />
          </View>
          <Text style={styles.big}>{current}</Text>
          <Text style={styles.label}>day streak with {settings.petName}</Text>
          <View style={styles.week}>
            {week.map((d) => (
              <View key={toDateKey(d.date)} style={styles.dayCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[styles.barFill, { height: `${Math.round((d.value ?? 0) * 100)}%` }]}
                  />
                </View>
                <Text style={styles.dayLetter}>{WEEKDAY_LETTERS[d.date.getDay()]}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.label}>{average}% of habits done this week</Text>
          <Text style={styles.footer}>Best streak: {best} days</Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={share} style={styles.button} accessibilityRole="button">
          <Ionicons name="share-social-outline" size={18} color={colors.onAccent} />
          <Text style={styles.buttonText}>Share</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.md,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 9 / 14,
    backgroundColor: colors.doneBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  brand: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  pet: {
    transform: [{ scale: 2 }],
    marginVertical: spacing.xl + spacing.sm,
  },
  big: {
    color: colors.text,
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 70,
  },
  label: {
    color: colors.accentLight,
    fontSize: 15,
    textAlign: 'center',
  },
  week: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  barTrack: {
    width: 18,
    height: 60,
    borderRadius: 6,
    backgroundColor: colors.card,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: colors.accent,
  },
  dayLetter: {
    color: colors.textMuted,
    fontSize: 11,
  },
  footer: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignSelf: 'stretch',
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
}));
