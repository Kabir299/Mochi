import { useCallback } from 'react';

import { buildPayload } from '@/lib/ai';
import { parseProfile } from '@/lib/profile';
import { useHabits } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';

// Builds the stats summary every AI feature sends along: habits, streaks,
// and water/food goals and logs for Pro users (or whenever something is logged).
export function useAiPayload() {
  const { habits, dayProgress, habitProgress, streakFor } = useHabits();
  const { water, food, waterFor, foodFor } = useNutrition();
  const settings = useSettings();

  return useCallback(() => {
    const hasNutrition = settings.isPro || water.length > 0 || food.length > 0;
    return buildPayload({
      today: new Date(),
      habits,
      dayProgress,
      habitProgress,
      streakFor,
      profile: parseProfile(settings.profile) ?? undefined,
      nutrition: hasNutrition
        ? {
            waterGoalMl: settings.waterGoalMl,
            calorieGoal: settings.calorieGoal,
            proteinGoal: settings.proteinGoal,
            waterFor,
            foodFor,
          }
        : undefined,
    });
  }, [
    habits,
    dayProgress,
    habitProgress,
    streakFor,
    water,
    food,
    waterFor,
    foodFor,
    settings,
  ]);
}
