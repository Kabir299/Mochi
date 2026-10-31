import type { HabitInput, IconName } from '@/state/habits';

import { STARTER_HABITS } from '@/lib/starter';

export type TemplatePack = {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  habits: HabitInput[];
};

const base = {
  target: 1,
  unit: null,
  repeat: 'daily' as const,
  weight: 2,
  days: [],
  onceDay: null,
};

const at = (hour: number, minute: number, durationMin: number) => ({
  startMinute: hour * 60 + minute,
  durationMin,
});
const anytime = { startMinute: null, durationMin: null };

export const TEMPLATE_PACKS: TemplatePack[] = [
  {
    id: 'starter',
    name: 'Starter day',
    description: 'A simple, balanced day to begin with.',
    icon: 'sparkles-outline',
    habits: STARTER_HABITS,
  },
  {
    id: 'morning',
    name: 'Morning routine',
    description: 'Start the day calm and focused.',
    icon: 'sunny-outline',
    habits: [
      {
        ...base,
        ...at(6, 30, 15),
        name: 'No phone for the first hour',
        icon: 'phone-portrait-outline',
      },
      { ...base, ...at(6, 45, 10), name: 'Make the bed', icon: 'bed-outline', weight: 1 },
      { ...base, ...at(7, 0, 10), name: 'Stretch', icon: 'body-outline' },
      { ...base, ...at(7, 15, 10), name: 'Plan the day', icon: 'list-outline', weight: 3 },
    ],
  },
  {
    id: 'fitness',
    name: 'Fitness',
    description: 'Move more and recover well.',
    icon: 'barbell-outline',
    habits: [
      {
        ...base,
        ...at(18, 0, 45),
        name: 'Workout',
        icon: 'barbell-outline',
        weight: 3,
        repeat: 'days',
        days: [1, 3, 5],
      },
      { ...base, ...anytime, name: 'Walk 10k steps', icon: 'walk-outline', weight: 2 },
      {
        ...base,
        ...anytime,
        name: 'Protein with every meal',
        icon: 'nutrition-outline',
        target: 3,
        unit: 'meals',
      },
      { ...base, ...at(21, 30, 10), name: 'Stretch before bed', icon: 'body-outline', weight: 1 },
    ],
  },
  {
    id: 'study',
    name: 'Study',
    description: 'Deep focus without burning out.',
    icon: 'school-outline',
    habits: [
      { ...base, ...at(9, 0, 90), name: 'Deep work block', icon: 'code-slash-outline', weight: 3 },
      { ...base, ...at(14, 0, 60), name: 'Revise notes', icon: 'book-outline' },
      { ...base, ...anytime, name: 'Read 20 pages', icon: 'reader-outline' },
      { ...base, ...anytime, name: 'Learn one new word', icon: 'language-outline', weight: 1 },
    ],
  },
  {
    id: 'sleep',
    name: 'Sleep better',
    description: 'Wind down and wake up rested.',
    icon: 'moon-outline',
    habits: [
      { ...base, ...anytime, name: 'No caffeine after 2 PM', icon: 'cafe-outline' },
      {
        ...base,
        ...at(21, 30, 30),
        name: 'Screens off',
        icon: 'phone-portrait-outline',
        weight: 3,
      },
      { ...base, ...at(22, 0, 15), name: 'Read in bed', icon: 'book-outline', weight: 1 },
      { ...base, ...at(22, 30, 5), name: 'Lights out by 10:30', icon: 'moon-outline', weight: 3 },
    ],
  },
  {
    id: 'mind',
    name: 'Mindfulness',
    description: 'Small daily moments to reset.',
    icon: 'leaf-outline',
    habits: [
      { ...base, ...at(7, 0, 10), name: 'Meditate', icon: 'leaf-outline' },
      { ...base, ...anytime, name: 'Write 3 things I’m grateful for', icon: 'pencil-outline' },
      { ...base, ...anytime, name: 'Walk outside', icon: 'sunny-outline' },
      { ...base, ...at(21, 0, 10), name: 'Journal', icon: 'create-outline', weight: 1 },
    ],
  },
];
