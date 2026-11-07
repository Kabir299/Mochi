import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { formatMinute } from '@/lib/dates';
import { TEMPLATE_PACKS } from '@/lib/templates';
import { useHabits } from '@/state/habits';
import { colors, radius, spacing, themedStyles } from '@/theme';

export default function TemplatesScreen() {
  const { habits, addHabit } = useHabits();
  const [open, setOpen] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  // Skip habits with the same name as one you already have.
  const existing = new Set(habits.map((h) => h.name.toLowerCase()));

  const addPack = async (packId: string) => {
    const pack = TEMPLATE_PACKS.find((p) => p.id === packId)!;
    for (const habit of pack.habits) {
      if (!existing.has(habit.name.toLowerCase())) await addHabit(habit);
    }
    setAdded((prev) => [...prev, packId]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Templates" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Add a ready-made set of habits. You can edit or remove any of them afterwards.
        </Text>
        {TEMPLATE_PACKS.map((pack) => {
          const isOpen = open === pack.id;
          const done = added.includes(pack.id);
          return (
            <View key={pack.id} style={styles.card}>
              <Pressable
                onPress={() => setOpen(isOpen ? null : pack.id)}
                style={styles.header}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
              >
                <View style={styles.icon}>
                  <Ionicons name={pack.icon} size={22} color={colors.accent} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.name}>{pack.name}</Text>
                  <Text style={styles.description}>{pack.description}</Text>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>

              {isOpen && (
                <View style={styles.list}>
                  {pack.habits.map((habit) => (
                    <View key={habit.name} style={styles.habitRow}>
                      <Ionicons name={habit.icon} size={16} color={colors.textMuted} />
                      <Text style={styles.habitName}>{habit.name}</Text>
                      <Text style={styles.habitMeta}>
                        {habit.startMinute !== null ? formatMinute(habit.startMinute) : 'Any time'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable
                onPress={() => addPack(pack.id)}
                disabled={done}
                style={({ pressed }) => [
                  styles.add,
                  done && styles.addDone,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name={done ? 'checkmark' : 'add'}
                  size={18}
                  color={done ? colors.accent : colors.onAccent}
                />
                <Text style={[styles.addText, done && styles.addTextDone]}>
                  {done ? 'Added' : `Add ${pack.habits.length} habits`}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
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
  },
  intro: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
  },
  list: {
    gap: spacing.sm,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  habitName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  habitMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  addDone: {
    backgroundColor: colors.accentDark,
  },
  addText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  addTextDone: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
}));
