import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  bodyGoalHabits,
  DEFAULT_PROFILE,
  parseProfile,
  Physique,
  PHYSIQUES,
  suggestedTargets,
} from '@/lib/profile';
import { useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// "Do you also have a body goal?" Shown on the Nutrition tab the first time, and again
// from the small Body goal row. Sets calorie / protein / water targets and can add
// matching habits (fitted around times already taken).
export function BodyGoalCard() {
  const settings = useSettings();
  const { habits, addHabit } = useHabits();
  const profile = parseProfile(settings.profile) ?? DEFAULT_PROFILE;
  const [editing, setEditing] = useState(false);
  const [physique, setPhysique] = useState<Physique | null>(
    profile.physique === 'none' ? null : profile.physique,
  );
  const [weightText, setWeightText] = useState(profile.weightKg ? String(profile.weightKg) : '');
  const [addHabits, setAddHabits] = useState(true);
  const [saving, setSaving] = useState(false);

  const current = PHYSIQUES.find((o) => o.id === profile.physique);
  const open = !settings.bodyGoalAsked || editing;

  if (!open) {
    return (
      <Pressable onPress={() => setEditing(true)} style={styles.row} accessibilityRole="button">
        <Ionicons name="body-outline" size={18} color={colors.accent} />
        <Text style={styles.rowText}>
          Body goal: {current && profile.physique !== 'none' ? current.label : 'not set'}
        </Text>
        <Text style={styles.link}>{profile.physique !== 'none' ? 'Change' : 'Set one'}</Text>
      </Pressable>
    );
  }

  const kg = Number(weightText);
  const weightKg = kg >= 25 && kg <= 300 ? kg : null;

  const save = async () => {
    if (!physique) return;
    setSaving(true);
    const next = { ...profile, physique, weightKg };
    if (addHabits) {
      const taken = habits
        .filter((h) => h.startMinute !== null)
        .map((h): [number, number] => [h.startMinute!, h.startMinute! + (h.durationMin ?? 30)]);
      const existing = new Set(habits.map((h) => h.name.trim().toLowerCase()));
      for (const { why: _why, ...habit } of bodyGoalHabits(next, taken)) {
        if (!existing.has(habit.name.trim().toLowerCase())) await addHabit(habit);
      }
    }
    // Only the nutrition targets; the streak bar stays as the person set it.
    const { streakThreshold: _s, ...targets } = suggestedTargets(next);
    await settings.update({ ...targets, profile: JSON.stringify(next), bodyGoalAsked: true });
    setSaving(false);
    setEditing(false);
  };

  const notNow = async () => {
    await settings.update({ bodyGoalAsked: true });
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Do you also have a body goal?</Text>
      <Text style={styles.body}>
        I’ll set your calorie, protein and water targets to match.
      </Text>
      <View style={styles.chips}>
        {PHYSIQUES.filter((o) => o.id !== 'none').map((o) => {
          const on = physique === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => setPhysique(o.id)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {physique && (
        <>
          <Text style={styles.body}>{PHYSIQUES.find((o) => o.id === physique)?.hint}</Text>
          <TextInput
            value={weightText}
            onChangeText={(t) => setWeightText(t.replace(/[^0-9.]/g, ''))}
            placeholder="Your weight in kg (optional, for exact targets)"
            placeholderTextColor={colors.iconMuted}
            keyboardType="decimal-pad"
            style={styles.input}
            maxLength={5}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Add matching habits to my plan</Text>
            <Switch
              value={addHabits}
              onValueChange={setAddHabits}
              trackColor={{ true: colors.accentDark, false: colors.border }}
              thumbColor={addHabits ? colors.accent : colors.textMuted}
            />
          </View>
        </>
      )}
      <View style={styles.buttons}>
        <Pressable onPress={notNow} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>{editing ? 'Cancel' : 'Not now'}</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={!physique || saving}
          style={[styles.button, (!physique || saving) && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Set my goal</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextOn: { color: colors.onAccent, fontWeight: '600' },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 15,
    padding: spacing.md,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { flex: 1, color: colors.text, fontSize: 14 },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xl,
  },
  disabled: { opacity: 0.4 },
  buttonText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  link: { color: colors.accent, fontSize: 14, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowText: { flex: 1, color: colors.text, fontSize: 14 },
});
