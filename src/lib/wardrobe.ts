// Colours and accessories for the pet, unlocked by the best day streak. Early
// unlocks (1 and 3 days) give new users something to look forward to.
export type PetColor = 'mint' | 'peach' | 'sky' | 'lilac' | 'gold';
export type PetItem = 'auto' | 'none' | 'sprout' | 'bow' | 'crown';

export const PET_COLORS: { id: PetColor; label: string; color: string; unlock: number }[] = [
  { id: 'mint', label: 'Mint', color: '#5DCAA5', unlock: 0 },
  { id: 'peach', label: 'Peach', color: '#F2A88B', unlock: 1 },
  { id: 'sky', label: 'Sky', color: '#85B7EB', unlock: 3 },
  { id: 'lilac', label: 'Lilac', color: '#B9A3F0', unlock: 14 },
  { id: 'gold', label: 'Gold', color: '#EFC45A', unlock: 60 },
];

export const PET_ITEMS: { id: PetItem; label: string; unlock: number }[] = [
  { id: 'auto', label: 'Grows with me', unlock: 0 },
  { id: 'none', label: 'Nothing', unlock: 0 },
  { id: 'sprout', label: 'Sprout', unlock: 7 },
  { id: 'bow', label: 'Bow', unlock: 30 },
  { id: 'crown', label: 'Crown', unlock: 100 },
];

export function colorFor(id: string) {
  return (PET_COLORS.find((c) => c.id === id) ?? PET_COLORS[0]).color;
}

// What "Grows with me" shows at a given best streak.
export function autoItem(streak: number): Exclude<PetItem, 'auto'> {
  if (streak >= 100) return 'crown';
  if (streak >= 30) return 'bow';
  if (streak >= 7) return 'sprout';
  return 'none';
}
