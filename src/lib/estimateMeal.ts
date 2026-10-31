import { type Food, FOODS } from '@/lib/foods';

export type EstimateItem = {
  food: Food;
  // How many portions, e.g. 2 for "2 roti" or 2 for "200g paneer".
  amount: number;
  kcal: number;
  protein: number;
};

export type MealEstimate = {
  items: EstimateItem[];
  kcal: number;
  protein: number;
  // Parts of the text that didn't match any known food.
  unmatched: string[];
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  half: 0.5,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  ten: 10,
  couple: 2,
};

// Every name and alias, longest first, so "masala dosa" wins over "dosa".
const TERMS = FOODS.flatMap((food) =>
  [food.name, ...(food.aliases ?? [])].map((term) => ({ term, food })),
).sort((a, b) => b.term.length - a.term.length);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERM_PATTERNS = TERMS.map(({ term, food }) => ({
  food,
  pattern: new RegExp(`\\b${escape(term)}(es|s)?\\b`),
}));

function findFood(text: string) {
  return TERM_PATTERNS.find(({ pattern }) => pattern.test(text))?.food;
}

function quantityOf(text: string) {
  const fraction = /\b(\d+)\s*\/\s*(\d+)\b/.exec(text);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const times = /\bx\s*(\d+(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?)\s*x\b/.exec(text);
  if (times) return Number(times[1] ?? times[2]);
  const number = /\b(\d+(?:\.\d+)?)\b/.exec(text);
  if (number) return Number(number[1]);
  const word = Object.keys(WORD_NUMBERS).find((w) => new RegExp(`\\b${w}\\b`).test(text));
  return word ? WORD_NUMBERS[word] : 1;
}

// Turns "2 roti, dal and 200g paneer" into calories and protein using the
// built-in food list. Works offline; unknown foods are reported back.
export function estimateMeal(input: string): MealEstimate {
  const parts = input
    .toLowerCase()
    .split(/,|;|\+|&|\n|\band\b|\bwith\b|\bplus\b/)
    .map((p) => p.trim())
    .filter(Boolean);

  const items: EstimateItem[] = [];
  const unmatched: string[] = [];

  for (const part of parts) {
    const food = findFood(part);
    if (!food) {
      unmatched.push(part);
      continue;
    }
    // A weight ("200g", "250 ml") scales from the portion's weight.
    const weight = /(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|ml)\b/.exec(part);
    const amount = weight ? Number(weight[1]) / food.grams : quantityOf(part);
    if (!Number.isFinite(amount) || amount <= 0) {
      unmatched.push(part);
      continue;
    }
    items.push({ food, amount, kcal: food.kcal * amount, protein: food.protein * amount });
  }

  return {
    items,
    kcal: Math.round(items.reduce((s, i) => s + i.kcal, 0)),
    protein: Math.round(items.reduce((s, i) => s + i.protein, 0)),
    unmatched,
  };
}

// "2 × roti", "1.5 × 100 g paneer"
export function describeItem(item: EstimateItem) {
  const amount = Number.isInteger(item.amount) ? item.amount : Math.round(item.amount * 10) / 10;
  return `${amount} × ${item.food.portion.startsWith('1 ') ? item.food.name : `${item.food.portion} ${item.food.name}`}`;
}
