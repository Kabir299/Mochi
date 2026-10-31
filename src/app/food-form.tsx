import { useMemo, useState } from 'react';
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

import { closeModal } from '@/lib/nav';
import { ModalHeader } from '@/components/ModalHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { Segmented } from '@/components/Segmented';
import { FoodEstimate, requestFoodEstimate } from '@/lib/ai';
import { toDateKey } from '@/lib/dates';
import { describeItem, estimateMeal } from '@/lib/estimateMeal';
import type { Meal } from '@/lib/db';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const MEAL_OPTIONS = [
  ['breakfast', 'Breakfast'],
  ['lunch', 'Lunch'],
  ['dinner', 'Dinner'],
  ['snack', 'Snack'],
] as const;

function mealForNow(): Meal {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

// Whole numbers only; empty counts as 0.
function parseAmount(text: string) {
  if (text.trim() === '') return 0;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export default function FoodFormScreen() {
  const { addFood } = useNutrition();
  const { isPro } = useSettings();
  const [name, setName] = useState('');
  const [meal, setMeal] = useState<Meal>(mealForNow);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Calories and protein follow the estimate until you type your own numbers.
  const [manual, setManual] = useState(false);
  const [ai, setAi] = useState<{ text: string; result: FoodEstimate } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const local = useMemo(() => estimateMeal(name), [name]);
  // An AI estimate only applies to the exact text it was made for.
  const aiResult = ai && ai.text === name.trim() ? ai.result : null;
  const estimate = aiResult
    ? { kcal: Math.round(aiResult.total_calories), protein: Math.round(aiResult.total_protein_g) }
    : local.items.length > 0
      ? { kcal: local.kcal, protein: local.protein }
      : null;
  const shownCalories = manual ? calories : estimate ? String(estimate.kcal) : '';
  const shownProtein = manual ? protein : estimate ? String(estimate.protein) : '';

  // Switching to manual keeps whatever was showing as the starting point.
  const editAmount = (field: 'calories' | 'protein', text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    if (!manual) {
      setManual(true);
      setCalories(field === 'calories' ? clean : shownCalories);
      setProtein(field === 'protein' ? clean : shownProtein);
    } else if (field === 'calories') {
      setCalories(clean);
    } else {
      setProtein(clean);
    }
    setError(null);
  };

  const askAi = async () => {
    const text = name.trim();
    if (!text) return;
    setAiLoading(true);
    setAiError(null);
    try {
      setAi({ text, result: await requestFoodEstimate(text) });
      setManual(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Couldn’t get an AI estimate.');
    } finally {
      setAiLoading(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    const kcal = parseAmount(shownCalories);
    const grams = parseAmount(shownProtein);
    if (!trimmed) return setError('Enter what you ate');
    if (kcal === null || grams === null)
      return setError('Calories and protein must be whole numbers');
    setSaving(true);
    try {
      await addFood({
        day: toDateKey(new Date()),
        meal,
        name: trimmed,
        calories: kcal,
        protein: grams,
      });
      closeModal();
    } catch {
      setError("Couldn't save this. Try again.");
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ModalHeader
          title="Add food"
          leftLabel="Cancel"
          right={
            <Pressable onPress={save} disabled={saving} hitSlop={12}>
              <Text style={styles.save}>Save</Text>
            </Pressable>
          }
        />
        <PrivacyNote text="Food is saved on this phone. The AI estimate sends only the meal text, deleted right after." />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>What did you eat?</Text>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                setError(null);
              }}
              placeholder="2 roti, dal and a bowl of rice"
              placeholderTextColor={colors.iconMuted}
              style={styles.input}
              autoFocus
              maxLength={120}
            />
            <Text style={styles.hint}>
              List what you had, with amounts if you know them: “200g paneer”, “2 eggs”.
            </Text>
          </View>

          {name.trim() !== '' && (
            <View style={styles.estimate}>
              <View style={styles.estimateHeader}>
                <Ionicons name="calculator-outline" size={16} color={colors.accentLight} />
                <Text style={styles.estimateTitle}>
                  {estimate
                    ? `About ${estimate.kcal} kcal · ${estimate.protein} g protein`
                    : 'No match in the food list yet'}
                </Text>
              </View>
              {aiResult
                ? aiResult.items.map((item) => (
                    <Text key={item.name} style={styles.estimateLine}>
                      {item.portion} {item.name} · {Math.round(item.calories)} kcal ·{' '}
                      {Math.round(item.protein_g)} g
                    </Text>
                  ))
                : local.items.map((item, i) => (
                    <Text key={i} style={styles.estimateLine}>
                      {describeItem(item)} · {Math.round(item.kcal)} kcal ·{' '}
                      {Math.round(item.protein)} g
                    </Text>
                  ))}
              {!aiResult && local.unmatched.length > 0 && (
                <Text style={styles.unmatched}>Not recognised: {local.unmatched.join(', ')}</Text>
              )}
              {manual && estimate && (
                <Pressable onPress={() => setManual(false)} hitSlop={8}>
                  <Text style={styles.link}>Use the estimate again</Text>
                </Pressable>
              )}
              {isPro && !aiResult && (local.unmatched.length > 0 || !estimate) && (
                <Pressable onPress={askAi} disabled={aiLoading} style={styles.aiButton}>
                  {aiLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
                  )}
                  <Text style={styles.link}>Estimate with AI</Text>
                </Pressable>
              )}
              {aiError && <Text style={styles.error}>{aiError}</Text>}
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Meal</Text>
            <Segmented options={MEAL_OPTIONS} value={meal} onChange={setMeal} />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, styles.flex]}>
              <Text style={styles.label}>Calories (kcal)</Text>
              <TextInput
                value={shownCalories}
                onChangeText={(t) => editAmount('calories', t)}
                placeholder="450"
                placeholderTextColor={colors.iconMuted}
                keyboardType="number-pad"
                style={styles.input}
                maxLength={5}
              />
            </View>
            <View style={[styles.field, styles.flex]}>
              <Text style={styles.label}>Protein (g)</Text>
              <TextInput
                value={shownProtein}
                onChangeText={(t) => editAmount('protein', t)}
                placeholder="30"
                placeholderTextColor={colors.iconMuted}
                keyboardType="number-pad"
                style={styles.input}
                maxLength={4}
              />
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.iconMuted,
    fontSize: 12,
  },
  estimate: {
    backgroundColor: colors.accentDark,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: 4,
    marginTop: -spacing.sm,
  },
  estimateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  estimateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  estimateLine: {
    color: colors.accentLight,
    fontSize: 13,
  },
  unmatched: {
    color: colors.streak,
    fontSize: 13,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  save: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
