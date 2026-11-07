import { ComponentRef, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BodyGoalCard } from '@/components/BodyGoalCard';
import { ProgressChart } from '@/components/ProgressChart';
import { ProLock } from '@/components/ProLock';
import { Spotlight } from '@/components/Spotlight';
import { TrackPicker } from '@/components/TrackPicker';
import { formatDuration, lastNDays, toDateKey } from '@/lib/dates';
import { useToday } from '@/lib/useToday';
import type { Meal } from '@/lib/db';
import { useHabits } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const WATER_AMOUNTS = [250, 500, 750];
const GYM_MINUTES = [30, 45, 60, 90];
const MEALS: [Meal, string][] = [
  ['breakfast', 'Breakfast'],
  ['lunch', 'Lunch'],
  ['dinner', 'Dinner'],
  ['snack', 'Snacks'],
];

const fmt = (n: number) => n.toLocaleString();

export default function NutritionScreen() {
  const settings = useSettings();
  const { water, gym, waterFor, foodFor, addWater, removeWater, removeFood, addGym, removeGym } =
    useNutrition();
  const { habitsOn, isDone, checkIn } = useHabits();
  const [choosing, setChoosing] = useState(false);

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

  const weekDays = new Set(lastNDays(today, 7).map(toDateKey));
  const gymWeek = gym.filter((g) => weekDays.has(g.day));
  const gymWeekMin = gymWeek.reduce((s, g) => s + g.minutes, 0);
  const lastGymToday = [...gym].reverse().find((g) => g.day === todayKey);

  const logGym = async (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addGym(todayKey, minutes);
    const habit = habitsOn(todayKey).find(
      (h) => /gym|workout/i.test(h.name) && !isDone(h, todayKey),
    );
    if (habit) checkIn(habit, todayKey);
  };

  const { trackAsked, trackFood, trackWater, trackGym, isPro } = settings;
  const picking = !trackAsked || choosing;
  const foodOn = trackFood && isPro;
  const waterRef = useRef<ComponentRef<typeof View>>(null);
  const gymRef = useRef<ComponentRef<typeof View>>(null);
  const foodRef = useRef<ComponentRef<typeof View>>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const guideOn = !picking && !settings.nutritionGuideSeen && (trackWater || trackGym || foodOn);
  const finishGuide = () => settings.update({ nutritionGuideSeen: true });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Tabs mount on first open, so nothing here shows until this tab is first tapped. */}
      {guideOn && (
        <Spotlight
          stepKey="health"
          target={trackWater ? waterRef : trackGym ? gymRef : foodRef}
          title="Log it in one tap"
          body="Tap an amount as you go. Change what shows here at the bottom of this tab."
          nextLabel="Got it"
          onNext={finishGuide}
          scrollBy={(dy) =>
            scroller.current?.scrollTo({ y: scrollY.current + dy, animated: false })
          }
        />
      )}
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.content}
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
      >
        <Text style={styles.title}>Health</Text>
        {picking ? (
          <TrackPicker onDone={() => setChoosing(false)} />
        ) : (
          <>
            {(trackWater || foodOn) && (
              <View collapsable={false}>
                <BodyGoalCard />
              </View>
            )}

            {!trackWater && !trackFood && !trackGym && (
              <Text style={styles.sub}>You’re not tracking anything here right now.</Text>
            )}

            {trackWater && (
              <View ref={waterRef} collapsable={false} style={styles.card}>
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
            )}

            {trackGym && (
              <View ref={gymRef} collapsable={false} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name="barbell-outline" size={20} color={colors.accent} />
                  <Text style={styles.cardTitle}>Gym</Text>
                </View>
                <Text style={styles.big}>
                  {gymWeek.length}
                  <Text style={styles.bigUnit}>
                    {' '}
                    {gymWeek.length === 1 ? 'session' : 'sessions'} in the last 7 days
                  </Text>
                </Text>
                {gymWeekMin > 0 && (
                  <Text style={styles.sub}>{formatDuration(gymWeekMin)} in total</Text>
                )}
                <View style={styles.quickRow}>
                  {GYM_MINUTES.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => logGym(m)}
                      style={({ pressed }) => [styles.quick, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Log a ${m} minute session`}
                    >
                      <Text style={styles.quickText}>{m} min</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => lastGymToday && removeGym(lastGymToday.id)}
                    style={({ pressed }) => [
                      styles.undo,
                      !lastGymToday && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Undo last session"
                  >
                    <Ionicons name="arrow-undo-outline" size={18} color={colors.text} />
                  </Pressable>
                </View>
              </View>
            )}

            {trackFood && !isPro && (
              <ProLock
                title="Track your calories"
                body="Record meals with calories and protein, let AI estimate them, and see how you're doing against your daily goals."
              />
            )}

            {foodOn && (
              <View ref={foodRef} collapsable={false} style={styles.card}>
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
            )}

            {(trackWater || foodOn) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Daily goals</Text>
                {trackWater && (
                  <GoalStepper
                    label="Water"
                    value={settings.waterGoalMl}
                    unit="ml"
                    step={250}
                    min={500}
                    onChange={(v) => settings.update({ waterGoalMl: v })}
                  />
                )}
                {foodOn && (
                  <>
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
                  </>
                )}
              </View>
            )}

            <Pressable onPress={() => setChoosing(true)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.changeLink}>Change what I track</Text>
            </Pressable>
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

const styles = themedStyles(() => ({
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
  changeLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: spacing.sm,
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
}));
