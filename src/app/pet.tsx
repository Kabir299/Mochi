import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { PET_COLORS, PET_ITEMS } from '@/lib/wardrobe';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// The pet's wardrobe: colours and accessories unlocked by the best day streak.
export default function PetScreen() {
  const { best: bestParam, current: currentParam } = useLocalSearchParams<{
    best?: string;
    current?: string;
  }>();
  const best = Number(bestParam) || 0;
  const current = Number(currentParam) || 0;
  const settings = useSettings();

  const nextUnlock = [...PET_COLORS, ...PET_ITEMS]
    .filter((x) => x.unlock > best)
    .sort((a, b) => a.unlock - b.unlock)[0];

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader
        title={settings.petName}
        right={
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/share-card',
                params: { best: String(best), current: String(current) },
              })
            }
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Share"
          >
            <Ionicons name="share-social-outline" size={22} color={colors.accent} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stage}>
          <View style={styles.big}>
            <Pet mood="happy" streak={best} />
          </View>
          <Text style={styles.streak}>
            {current}-day streak · best {best}
          </Text>
          {nextUnlock && (
            <Text style={styles.next}>
              Next: {nextUnlock.label} at a {nextUnlock.unlock}-day streak (
              {nextUnlock.unlock - best} to go)
            </Text>
          )}
        </View>

        <Text style={styles.section}>Colour</Text>
        <View style={styles.grid}>
          {PET_COLORS.map((c) => {
            const locked = c.unlock > best;
            const on = settings.petColor === c.id;
            return (
              <Pressable
                key={c.id}
                disabled={locked}
                onPress={() => settings.update({ petColor: c.id })}
                style={[styles.tile, on && styles.tileOn, locked && styles.locked]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: locked }}
              >
                <View style={[styles.swatch, { backgroundColor: c.color }]}>
                  {locked && <Ionicons name="lock-closed" size={14} color="#1A1A22" />}
                </View>
                <Text style={styles.tileText}>{c.label}</Text>
                {locked && <Text style={styles.tileHint}>{c.unlock} days</Text>}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Accessory</Text>
        <View style={styles.grid}>
          {PET_ITEMS.map((item) => {
            const locked = item.unlock > best;
            const on = settings.petItem === item.id;
            return (
              <Pressable
                key={item.id}
                disabled={locked}
                onPress={() => settings.update({ petItem: item.id })}
                style={[styles.tile, on && styles.tileOn, locked && styles.locked]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: locked }}
              >
                <View style={styles.mini}>
                  <Pet
                    mood="happy"
                    streak={best}
                    preview={{ color: settings.petColor, item: item.id }}
                  />
                </View>
                <Text style={styles.tileText}>{item.label}</Text>
                {locked && <Text style={styles.tileHint}>{item.unlock} days</Text>}
              </Pressable>
            );
          })}
        </View>
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
    gap: spacing.md,
  },
  stage: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  big: {
    transform: [{ scale: 1.8 }],
    marginVertical: spacing.xl,
  },
  streak: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  next: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  section: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '31%',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileOn: {
    borderColor: colors.accent,
  },
  locked: {
    opacity: 0.45,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mini: {
    height: 48,
    justifyContent: 'center',
    transform: [{ scale: 0.8 }],
  },
  tileText: {
    color: colors.text,
    fontSize: 13,
  },
  tileHint: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
