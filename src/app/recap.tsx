import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalHeader } from '@/components/ModalHeader';
import { Pet } from '@/components/Pet';
import { addDays, fromDateKey, toDateKey } from '@/lib/dates';
import { MOODS } from '@/lib/moods';
import { closeModal } from '@/lib/nav';
import { useDayLogs } from '@/state/dayLogs';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// The evening wrap-up: how the day felt, one line about it, and unfinished one-off
// tasks moved to tomorrow. Takes about 30 seconds; feeds the AI analysis.
export default function RecapScreen() {
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = dayParam ?? toDateKey(new Date());
  const tomorrow = toDateKey(addDays(fromDateKey(day), 1));
  const { habitsOn, isDone, dayProgress, editHabit } = useHabits();
  const { loaded, dayLogFor, saveDayLog } = useDayLogs();
  const { petName, streakThreshold } = useSettings();
  const existing = dayLogFor(day);

  const tasks = habitsOn(day);
  const done = tasks.filter((h) => isDone(h, day));
  const unfinished = tasks.filter((h) => !isDone(h, day));
  const percent = Math.round((dayProgress(day) ?? 0) * 100);
  const kept = percent >= Math.round(streakThreshold * 100);

  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  // Fill in a saved recap once it has loaded (opening the app straight here).
  const [filled, setFilled] = useState(loaded);
  if (loaded && !filled) {
    setFilled(true);
    if (existing) {
      setMood(existing.mood);
      setNote(existing.note ?? '');
    }
  }
  // One-off tasks move to tomorrow unless unticked (kept here, so it works before habits load).
  const [keep, setKeep] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    for (const habit of unfinished) {
      if (habit.repeat === 'once' && !keep.has(habit.id)) {
        await editHabit(habit.id, { ...habit, onceDay: tomorrow });
      }
    }
    await saveDayLog({ day, mood, note: note.trim() || null });
    closeModal();
  };

  const headline =
    percent === 100
      ? 'A perfect day. Every single one.'
      : kept
        ? `${percent}% done, and the streak is safe.`
        : done.length > 0
          ? `${done.length} of ${tasks.length} done. Not every day is a 100 day, and that’s fine.`
          : 'A quiet day. Tomorrow is a clean page.';

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Wrap up your day" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Pet mood={percent === 100 ? 'ecstatic' : kept ? 'happy' : 'okay'} />
          <Text style={styles.headline}>{headline}</Text>
          <Text style={styles.sub}>
            {fromDateKey(day).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'short',
            })}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>How did today feel?</Text>
          <View style={styles.moods}>
            {MOODS.map((m) => {
              const on = mood === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setMood(on ? null : m.value)}
                  style={[styles.mood, on && styles.moodOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={m.label}
                >
                  <Text style={styles.face}>{m.face}</Text>
                  <Text style={[styles.moodLabel, on && styles.moodLabelOn]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="One line about today (optional)"
            placeholderTextColor={colors.iconMuted}
            style={styles.input}
            maxLength={200}
            multiline
          />
        </View>

        {unfinished.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>Still open</Text>
            {unfinished.map((h) => {
              const once = h.repeat === 'once';
              const on = !keep.has(h.id);
              return (
                <Pressable
                  key={h.id}
                  disabled={!once}
                  onPress={() =>
                    setKeep((prev) => {
                      const next = new Set(prev);
                      if (next.has(h.id)) next.delete(h.id);
                      else next.add(h.id);
                      return next;
                    })
                  }
                  style={styles.taskRow}
                  accessibilityRole={once ? 'checkbox' : undefined}
                  accessibilityState={once ? { checked: on } : undefined}
                >
                  <Ionicons name={h.icon} size={16} color={colors.textMuted} />
                  <Text style={styles.taskName}>{h.name}</Text>
                  {once ? (
                    <View style={styles.moveRow}>
                      <Text style={[styles.moveText, on && styles.moveTextOn]}>
                        {on ? 'Move to tomorrow' : 'Leave it'}
                      </Text>
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={on ? colors.accent : colors.iconMuted}
                      />
                    </View>
                  ) : (
                    <Text style={styles.moveText}>Back tomorrow</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={save}
          disabled={saving}
          style={[styles.button, saving && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Done for today</Text>
        </Pressable>
        <Text style={styles.footnote}>
          {petName} uses your recaps to spot what helps your good days.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg + 4, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  headline: { color: colors.text, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  sub: { color: colors.textMuted, fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  moods: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  mood: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    gap: 2,
  },
  moodOn: { backgroundColor: colors.accentDark },
  face: { fontSize: 24 },
  moodLabel: { color: colors.textMuted, fontSize: 11 },
  moodLabelOn: { color: colors.accentLight, fontWeight: '600' },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 15,
    padding: spacing.md,
    minHeight: 48,
  },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  taskName: { flex: 1, color: colors.text, fontSize: 15 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  moveText: { color: colors.textMuted, fontSize: 13 },
  moveTextOn: { color: colors.accent },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
  footnote: { color: colors.iconMuted, fontSize: 12, textAlign: 'center' },
});
