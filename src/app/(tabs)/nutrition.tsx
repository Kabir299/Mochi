import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressChart } from '@/components/ProgressChart';
import { ProLock } from '@/components/ProLock';
import { lastNDays, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/useToday';
import type { Meal } from '@/lib/db';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

const WATER_AMOUNTS = [250, 500, 750];
const MEALS: [Meal, string][] = [
  ['breakfast', 'Breakfast'],
  ['lunch', 'Lunch'],
  ['dinner', 'Dinner'],
  ['snack', 'Snacks'],
];

const fmt = (n: number) => n.toLocaleString();

export default function NutritionScreen() {
  const settings = useSettings();
  const { water, waterFor, foodFor, addWater, removeWater, removeFood } = useNutrition();

  const today = useToday();
  const todayKey = toDateKey(today);

  const waterToday = waterFor(todayKey);
  const lastWaterToday = [...water].reverse().find((w) => w.day === todayKey);
  const food = foodFor(todayKey);
  const calories = food.reduce((s, f) => s + f.calories, 0);
  const protein = food.reduce((s, f) => s + f.protein, 0);

  const foodWeek = lastNDays(today, 7).map((date) => {
    const key = toDateKey(date);
    return { date, key, value: foodFor(key).reduce((s, f) => s + f.calories, 0) };
  });
  const weekFood = foodWeek.flatMap((d) => foodFor(d.key));
  const proteinWeek = weekFood.reduce((s, f) => s + f.protein, 0);
  const loggedDays = foodWeek.filter((d) => d.value > 0).length;

  const waterWeek = lastNDays(today, 7).map((date) => {
    const key = toDateKey(date);
    return { date, key, value: waterFor(key) };
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Nutrition</Text>

        {!settings.isPro ? (
          <ProLock
            title="Track water and food"
            body="Log glasses of water in one tap, record meals with calories and protein, and see how you're doing against your daily goals."
          />
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="water-outline" size={20} color={colors.water} />
                <Text style={styles.cardTitle}>Water</Text>
              </View>
              <Text style={styles.big}>
                {fmt(waterToday)}
                <Text style={styles.bigUnit}> / {fmt(settings.waterGoalMl)} ml</Text>
              </Text>
              <Bar value={waterToday / settings.waterGoalMl} color={colors.water} />
              <View style={styles.quickRow}>
                {WATER_AMOUNTS.map((ml) => (
                  <Pressable
                    key={ml}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      addWater(todayKey, ml);
                    }}
                    style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${ml} millilitres`}
                  >
                    <Text style={styles.quickText}>+{ml} ml</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => lastWaterToday && removeWater(lastWaterToday.id)}
                  style={({ pressed }) => [
                    styles.undo,
                    !lastWaterToday && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Undo last water"
                >
                  <Ionicons name="arrow-undo-outline" size={18} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.chart}>
                <ProgressChart
                  points={waterWeek}
                  max={settings.waterGoalMl}
                  format={(v) => `${fmt(v)} ml`}
                  gridLabels={[
                    `${fmt(settings.waterGoalMl)}`,
                    `${fmt(settings.waterGoalMl / 2)}`,
                    '0',
                  ]}
                />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="restaurant-outline" size={20} color={colors.streak} />
                <Text style={styles.cardTitle}>Food</Text>
                <Pressable
                  onPress={() => router.push('/food-form')}
                  style={({ pressed }) => [styles.addFood, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={18} color={colors.onAccent} />
                  <Text style={styles.addFoodText}>Add food</Text>
                </Pressable>
              </View>

              <View style={styles.macros}>
                <View style={styles.macro}>
                  <Text style={styles.macroLabel}>Calories</Text>
                  <Text style={styles.macroValue}>
                    {fmt(calories)}
                    <Text style={styles.macroGoal}> / {fmt(settings.calorieGoal)}</Text>
                  </Text>
                  <Bar value={calories / settings.calorieGoal} color={colors.streak} />
                </View>
                <View style={styles.macro}>
                  <Text style={styles.macroLabel}>Protein</Text>
                  <Text style={styles.macroValue}>
                    {fmt(protein)} g
                    <Text style={styles.macroGoal}> / {fmt(settings.proteinGoal)} g</Text>
                  </Text>
                  <Bar value={protein / settings.proteinGoal} color={colors.accent} />
                </View>
              </View>

              {food.length === 0 && <Text style={styles.sub}>Nothing logged yet today.</Text>}
              {MEALS.map(([meal, label]) => {
                const items = food.filter((f) => f.meal === meal);
                if (items.length === 0) return null;
                return (
                  <View key={meal} style={styles.meal}>
                    <Text style={styles.mealTitle}>
                      {label} · {fmt(items.reduce((s, f) => s + f.calories, 0))} kcal
                    </Text>
                    {items.map((item) => (
                      <View key={item.id} style={styles.foodRow}>
                        <Text style={styles.foodName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.foodMeta}>
                          {fmt(item.calories)} kcal · {item.protein} g
                        </Text>
                        <Pressable
                          onPress={() => removeFood(item.id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.name}`}
                        >
                          <Ionicons name="close" size={18} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                );
              })}

              <Text style={[styles.mealTitle, styles.historyTitle]}>Calories, last 7 days</Text>
              <View style={styles.chart}>
                <ProgressChart
                  points={foodWeek}
                  max={settings.calorieGoal}
                  format={(v) => `${fmt(v)} kcal`}
                  gridLabels={[
                    `${fmt(settings.calorieGoal)}`,
                    `${fmt(settings.calorieGoal / 2)}`,
                    '0',
                  ]}
                />
              </View>
              <Text style={styles.sub}>
                Protein this week: {fmt(proteinWeek)} g, about{' '}
                {fmt(proteinWeek / Math.max(1, loggedDays))} g a day on days you logged.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Daily goals</Text>
              <GoalStepper
                label="Water"
                value={settings.waterGoalMl}
                unit="ml"
                step={250}
                min={500}
                onChange={(v) => settings.update({ waterGoalMl: v })}
              />
              <GoalStepper
                label="Calories"
                value={settings.calorieGoal}
                unit="kcal"
                step={100}
                min={800}
                onChange={(v) => settings.update({ calorieGoal: v })}
              />
              <GoalStepper
                label="Protein"
                value={settings.proteinGoal}
                unit="g"
                step={10}
                min={20}
                onChange={(v) => settings.update({ proteinGoal: v })}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${Math.round(Math.min(value, 1) * 100)}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

type StepperProps = {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  onChange: (value: number) => void;
};

function GoalStepper({ label, value, unit, step, min, onChange }: StepperProps) {
  return (
    <View style={styles.goalRow}>
      <Text style={styles.goalLabel}>{label}</Text>
      <Pressable
        onPress={() => onChange(Math.max(min, value - step))}
        style={styles.stepButton}
        accessibilityLabel={`Lower ${label} goal`}
      >
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.goalValue}>
        {fmt(value)} {unit}
      </Text>
      <Pressable
        onPress={() => onChange(value + step)}
        style={styles.stepButton}
        accessibilityLabel={`Raise ${label} goal`}
      >
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
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
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  big: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
  },
  bigUnit: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '400',
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quick: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.waterDark,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
  },
  quickText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  undo: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  chart: {
    marginTop: spacing.sm,
  },
  addFood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  addFoodText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  macros: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  macro: {
    flex: 1,
    gap: 6,
  },
  macroLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  macroValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  macroGoal: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '400',
  },
  sub: {
    color: colors.textMuted,
    fontSize: 13,
  },
  meal: {
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyTitle: {
    marginTop: spacing.sm,
  },
  mealTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  foodName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  foodMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  goalLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  goalValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 90,
    textAlign: 'center',
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
