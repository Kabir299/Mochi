import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { fromDateKey } from '@/lib/dates';
import { MOODS } from '@/lib/moods';
import { closeModal } from '@/lib/nav';
import { useHabits } from '@/state/habits';
import { colors, radius, spacing, themedStyles } from '@/theme';

export default function NoteScreen() {
  const { id, day } = useLocalSearchParams<{ id: string; day: string }>();
  const { loaded, getHabit } = useHabits();
  if (!loaded) return <SafeAreaView style={styles.safe} />;
  const habit = getHabit(Number(id));
  if (!habit || !day) {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Note" />
        <Text style={styles.missing}>Habit not found.</Text>
      </SafeAreaView>
    );
  }
  return <NoteForm habitId={habit.id} day={day} />;
}

function NoteForm({ habitId, day }: { habitId: number; day: string }) {
  const { getHabit, entryFor, setNote } = useHabits();
  const habit = getHabit(habitId)!;
  const entry = entryFor(habitId, day);
  const [mood, setMood] = useState<number | null>(entry.mood);
  const [note, setText] = useState(entry.note ?? '');

  const save = async () => {
    await setNote(habit, day, note.trim() || null, mood);
    closeModal();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader
        title="Note and mood"
        leftLabel="Cancel"
        right={
          <Pressable onPress={save} hitSlop={12}>
            <Text style={styles.save}>Save</Text>
          </Pressable>
        }
      />
      <View style={styles.content}>
        <Text style={styles.habit}>{habit.name}</Text>
        <Text style={styles.day}>
          {fromDateKey(day).toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>

        <Text style={styles.label}>How did it feel?</Text>
        <View style={styles.moods}>
          {MOODS.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setMood(mood === m.value ? null : m.value)}
              style={[styles.mood, mood === m.value && styles.moodOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: mood === m.value }}
              accessibilityLabel={m.label}
            >
              <Text style={styles.face}>{m.face}</Text>
              <Text style={styles.moodLabel}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Note</Text>
        <TextInput
          value={note}
          onChangeText={setText}
          placeholder="Felt tired but did it anyway"
          placeholderTextColor={colors.iconMuted}
          style={styles.input}
          multiline
          maxLength={280}
        />
        <Text style={styles.helper}>
          Notes and moods help the AI coach spot patterns, like which days are hardest.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  missing: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  save: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.md,
  },
  habit: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
  day: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: -spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  moods: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mood: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  moodOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDark,
  },
  face: {
    fontSize: 24,
  },
  moodLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    padding: spacing.md,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  helper: {
    color: colors.iconMuted,
    fontSize: 12,
  },
}));
