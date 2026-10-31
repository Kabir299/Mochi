import type { IconName } from '@/state/habits';

export type Badge = {
  id: string;
  icon: IconName;
  name: string;
  description: string;
  earned: boolean;
};

type Stats = {
  totalCheckIns: number;
  bestDayStreak: number;
  perfectDays: number;
  focusMinutes: number;
  notes: number;
  habitCount: number;
};

// Simple milestone badges, all derived from existing data.
export function badgesFor(s: Stats): Badge[] {
  return [
    {
      id: 'first',
      icon: 'footsteps-outline',
      name: 'First step',
      description: 'Check in once',
      earned: s.totalCheckIns >= 1,
    },
    {
      id: 'builder',
      icon: 'construct-outline',
      name: 'Builder',
      description: 'Track 5 habits',
      earned: s.habitCount >= 5,
    },
    {
      id: 'week',
      icon: 'flame-outline',
      name: 'On fire',
      description: '7-day streak',
      earned: s.bestDayStreak >= 7,
    },
    {
      id: 'month',
      icon: 'medal-outline',
      name: 'Unstoppable',
      description: '30-day streak',
      earned: s.bestDayStreak >= 30,
    },
    {
      id: 'hundred',
      icon: 'trophy-outline',
      name: 'Legend',
      description: '100-day streak',
      earned: s.bestDayStreak >= 100,
    },
    {
      id: 'perfect',
      icon: 'star-outline',
      name: 'Perfect day',
      description: 'Hit 100% in a day',
      earned: s.perfectDays >= 1,
    },
    {
      id: 'perfect10',
      icon: 'sparkles-outline',
      name: 'Perfectionist',
      description: '10 perfect days',
      earned: s.perfectDays >= 10,
    },
    {
      id: 'checkins',
      icon: 'checkmark-done-outline',
      name: 'Centurion',
      description: '100 check-ins',
      earned: s.totalCheckIns >= 100,
    },
    {
      id: 'focus',
      icon: 'timer-outline',
      name: 'Deep focus',
      description: '5 hours of focus',
      earned: s.focusMinutes >= 300,
    },
    {
      id: 'journal',
      icon: 'chatbubble-ellipses-outline',
      name: 'Reflective',
      description: 'Write 10 notes',
      earned: s.notes >= 10,
    },
  ];
}
