import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { closeModal } from '@/lib/nav';
import { KeyboardLift } from '@/components/KeyboardLift';
import { ModalHeader } from '@/components/ModalHeader';
import { PrivacyNote } from '@/components/PrivacyNote';
import { Segmented } from '@/components/Segmented';
import { FoodEstimate, requestFoodEstimate } from '@/lib/ai';
import { DateKey, fromDateKey, toDateKey } from '@/lib/dates';
import { describeItem, estimateMeal } from '@/lib/estimateMeal';
import type { Meal } from '@/lib/db';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

// How long typing must pause before asking the AI about foods not on the list.
const AI_PAUSE_MS = 1200;

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
  // Opened from a past day on the Health tab, it logs to that day.
  const params = useLocalSearchParams<{ day?: string }>();
  const todayKey = toDateKey(new Date());
  const day: DateKey =
    params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) && params.day <= todayKey
      ? (params.day as DateKey)
      : todayKey;
  const pastDay =
    day === todayKey
      ? null
      : fromDateKey(day).toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
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

  // Anything not on the food list goes to the AI by itself once typing pauses. If that
  // fails (offline, say), the rough guess from the list stays in place.
  const text = name.trim();
  const needsAi = isPro && local.unmatched.length > 0 && !aiResult;
  const [aiFailedFor, setAiFailedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!needsAi || aiFailedFor === text) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setAiLoading(true);
      try {
        const result = await requestFoodEstimate(text);
        if (!stale) setAi({ text, result });
      } catch {
        if (!stale) setAiFailedFor(text);
      } finally {
        if (!stale) setAiLoading(false);
      }
    }, AI_PAUSE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
      setAiLoading(false);
    };
  }, [needsAi, text, aiFailedFor]);

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
        day,
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
      <KeyboardLift style={styles.flex}>
        <ModalHeader
          title={pastDay ? `Add food · ${pastDay}` : 'Add food'}
          leftLabel="Cancel"
          right={
            <Pressable onPress={save} disabled={saving} hitSlop={12}>
              <Text style={styles.save}>Save</Text>
            </Pressable>
          }
        />
        <PrivacyNote text="Food is saved on this phone. Foods not on the built-in list are sent to the AI as text only, deleted right after." />
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
              maxLength={200}
            />
            <Text style={styles.hint}>
              List what you had, commas optional: “cheese naan with gravy 100g”, “2 eggs toast”.
            </Text>
          </View>

          {name.trim() !== '' && (
            <View style={styles.estimate}>
              <View style={styles.estimateHeader}>
                <Ionicons name="calculator-outline" size={16} color={colors.accentLight} />
                <Text style={styles.estimateTitle}>
                  {estimate
                    ? `About ${estimate.kcal} kcal · ${estimate.protein} g protein`
                    : 'Type a food to estimate it'}
                </Text>
              </View>
              {aiResult
                ? aiResult.items.map((item, i) => (
                    <Text key={i} style={styles.estimateLine}>
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
              {!aiResult && local.unmatched.length > 0 && !aiLoading && (
                <Text style={styles.unmatched}>
                  Not on my list, so this is a rough guess: {local.unmatched.join(', ')}. Change
                  the numbers if you know better.
                </Text>
              )}
              {aiResult && <Text style={styles.estimateNote}>Estimated by AI</Text>}
              {aiLoading && (
                <View style={styles.aiButton}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.estimateNote}>Estimating what’s not on my list…</Text>
                </View>
              )}
              {manual && estimate && (
                <Pressable onPress={() => setManual(false)} hitSlop={8}>
                  <Text style={styles.link}>Use the estimate again</Text>
                </Pressable>
              )}
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
      </KeyboardLift>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
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
  estimateNote: {
    color: colors.textMuted,
    fontSize: 12,
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
}));
