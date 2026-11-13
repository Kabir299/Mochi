import { type Food, FOODS } from '@/lib/foods';

export type EstimateItem = {
  food: Food;
  // How many portions, e.g. 2 for "2 roti" or 2 for "200g paneer".
  amount: number;
  // The weight typed, when there was one.
  grams: number | null;
  kcal: number;
  protein: number;
  // Not in the food list: a rough guess from the words in its name.
  guess: boolean;
};

export type MealEstimate = {
  items: EstimateItem[];
  kcal: number;
  protein: number;
  // Words that didn't match any known food.
  unmatched: string[];
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  half: 0.5,
  quarter: 0.25,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  couple: 2,
  few: 3,
};

// Grams (or ml) in each unit of weight.
const WEIGHT_UNITS: Record<string, number> = {
  g: 1,
  gm: 1,
  gms: 1,
  gram: 1,
  grams: 1,
  ml: 1,
  kg: 1000,
  kgs: 1000,
  l: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  liters: 1000,
  oz: 28,
  ounce: 28,
  ounces: 28,
  lb: 454,
  lbs: 454,
};

const SIZES: Record<string, number> = {
  small: 0.75,
  mini: 0.5,
  medium: 1,
  regular: 1,
  large: 1.5,
  big: 1.5,
  double: 2,
};

const NEGATIONS = new Set(['no', 'without', 'minus', 'skip']);

// The same dish spelled the way people actually type it, so "gobhi prantha" finds
// "gobi paratha" instead of being read as two foods.
const SPELLINGS: Record<string, string> = {
  parantha: 'paratha',
  prantha: 'paratha',
  parontha: 'paratha',
  paronta: 'paratha',
  parathas: 'paratha',
  paranthas: 'paratha',
  gobhi: 'gobi',
  ghobi: 'gobi',
  alu: 'aloo',
  aaloo: 'aloo',
  aalu: 'aloo',
  panner: 'paneer',
  panir: 'paneer',
  subzi: 'sabzi',
  subji: 'sabji',
  rayta: 'raita',
  khichri: 'khichdi',
  chhole: 'chole',
  rajmah: 'rajma',
  pohe: 'poha',
  dosai: 'dosa',
  idly: 'idli',
};

// Breads that are often stuffed or filled: "egg paratha" is one paratha, not an egg and a
// paratha.
const FILLED = new Set(['paratha', 'kulcha', 'naan', 'sandwich', 'roll', 'wrap', 'dosa', 'frankie']);

// Words that join foods or describe an amount, and never count as a food themselves.
const FILLER = new Set(
  `with and plus or then also along side of the some in on for at to from my i had ate eat have
  having just only little bit extra more less piece pieces pc pcs slice slices bowl bowls katori
  cup cups glass glasses plate plates serving servings portion portions helping helpings mug mugs
  bottle bottles can cans tbsp tablespoon tablespoons tsp teaspoon teaspoons spoon spoons scoop
  scoops handful handfuls pack packet packets stick sticks x times today yesterday breakfast lunch
  dinner snack snacks brunch supper morning evening night home homemade fresh hot cold freshly
  cooked tasty spicy mild plain simple about around approx roughly`
    .split(/\s+/)
    .filter(Boolean),
);

const TERMS = new Map<string, Food>();
for (const food of FOODS) {
  for (const term of [food.name, ...(food.aliases ?? [])]) {
    const key = term.toLowerCase();
    if (!TERMS.has(key)) TERMS.set(key, food);
  }
}
const MAX_TERM_WORDS = Math.max(...[...TERMS.keys()].map((t) => t.split(' ').length));

// Every word we know, for fixing typos: joining words first, so "woth" becomes "with".
const VOCABULARY = [
  ...FILLER,
  ...Object.keys(WEIGHT_UNITS),
  ...new Set([...TERMS.keys()].flatMap((t) => t.split(' '))),
];
const KNOWN = new Set([...VOCABULARY, ...Object.keys(WORD_NUMBERS), ...Object.keys(SIZES), ...NEGATIONS]);

const singular = (word: string) => {
  if (word.endsWith('es') && TERMS.has(word.slice(0, -2))) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
};

// One letter wrong, missing, added, or two letters swapped.
function oneEditApart(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const corrected = new Map<string, string>();
function correctTypo(word: string) {
  if (word.length < 4 || /\d/.test(word) || KNOWN.has(word) || KNOWN.has(singular(word))) return word;
  let fixed = corrected.get(word);
  if (fixed === undefined) {
    // Short words are only fixed to joining words: "woth" is "with", but "tawa" is not "mawa" and "sukhi" is not "sushi".
    fixed =
      VOCABULARY.find(
        (known) =>
          known.length >= 4 &&
          (word.length >= 6 || FILLER.has(known)) &&
          oneEditApart(word, known),
      ) ?? word;
    corrected.set(word, fixed);
  }
  return fixed;
}

function tokenize(segment: string) {
  return (segment.match(/\d+\s*\/\s*\d+|\d+(?:\.\d+)?|[\p{L}]+/gu) ?? []).map(
    (word) => SPELLINGS[word] ?? SPELLINGS[correctTypo(word)] ?? correctTypo(word),
  );
}

const asNumber = (token: string) => {
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(token);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : NaN;
  return /^\d/.test(token) ? Number(token) : null;
};

// Longest name starting at this word, so "cheese naan" wins over "cheese".
function findTerm(tokens: string[], start: number) {
  for (let size = Math.min(MAX_TERM_WORDS, tokens.length - start); size > 0; size--) {
    const words = tokens.slice(start, start + size);
    const phrase = words.join(' ');
    const food =
      TERMS.get(phrase) ??
      TERMS.get([...words.slice(0, -1), singular(words[size - 1])].join(' '));
    if (food) return { food, size };
  }
  return null;
}

// Rough values for something not on the list, going by the words in its name.
const GUESSES: [RegExp, { portion: string; grams: number; kcal: number; protein: number }][] = [
  [/juice|tea|coffee|drink|soda|sharbat|sherbet/, { portion: '1 glass', grams: 250, kcal: 100, protein: 1 }],
  [/soup|broth/, { portion: '1 bowl', grams: 250, kcal: 120, protein: 6 }],
  [/salad/, { portion: '1 bowl', grams: 200, kcal: 150, protein: 5 }],
  [/cake|sweet|dessert|pudding|pie|mithai|halwa/, { portion: '1 serving', grams: 100, kcal: 330, protein: 4 }],
  [/chicken|mutton|lamb|beef|pork|fish|prawn|meat|kebab|kabab/, { portion: '1 serving', grams: 200, kcal: 350, protein: 28 }],
  [/paneer|egg|tofu|soya/, { portion: '1 serving', grams: 200, kcal: 300, protein: 18 }],
  [/curry|masala|gravy|korma|stew|sabzi|sabji/, { portion: '1 bowl', grams: 200, kcal: 250, protein: 8 }],
  [/rice|biryani|pulao|noodle|pasta/, { portion: '1 plate', grams: 300, kcal: 450, protein: 11 }],
  [/naan|roti|bread|paratha|bun|wrap|roll/, { portion: '1 piece', grams: 90, kcal: 250, protein: 7 }],
  [/fry|fried|pakora|chips/, { portion: '1 serving', grams: 120, kcal: 350, protein: 5 }],
];
const DEFAULT_GUESS = { portion: '1 serving', grams: 200, kcal: 300, protein: 10 };

function guessFood(name: string): Food {
  const guess = GUESSES.find(([pattern]) => pattern.test(name))?.[1] ?? DEFAULT_GUESS;
  return { name, ...guess };
}

type Amount = { count: number | null; grams: number | null };
type Entry =
  | { kind: 'amount'; amount: Amount }
  | { kind: 'food'; food: Food; guess: boolean; scale: number; skip: boolean; amount: Amount | null };

function readEntries(tokens: string[], unmatched: string[]) {
  const entries: Entry[] = [];
  let scale = 1;
  let skip = false;
  let unknown: string[] = [];

  const addFood = (food: Food, guess: boolean) => {
    entries.push({ kind: 'food', food, guess, scale, skip, amount: null });
    scale = 1;
    skip = false;
  };
  const endUnknown = (nextIsFood: boolean) => {
    if (unknown.length === 0) return;
    const name = unknown.join(' ');
    unknown = [];
    unmatched.push(name);
    // A lone word just before a food usually describes it: "tawa roti", "kerala chicken".
    if (!(nextIsFood && !name.includes(' '))) addFood(guessFood(name), true);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let value = asNumber(token);
    if (value !== null) {
      // "1 1/2" is one and a half.
      const next = tokens[i + 1];
      if (next?.includes('/') && Number.isInteger(value)) {
        value += asNumber(next) ?? 0;
        i++;
      }
      endUnknown(false);
      const unit = WEIGHT_UNITS[tokens[i + 1]];
      if (unit) {
        entries.push({ kind: 'amount', amount: { count: null, grams: value * unit } });
        i++;
      } else {
        entries.push({ kind: 'amount', amount: { count: value, grams: null } });
      }
      continue;
    }

    const match = findTerm(tokens, i);
    const after = match && findTerm(tokens, i + match.size);
    if (match && after && FILLED.has(tokens[i + match.size + after.size - 1])) {
      // A filling and its bread, like "egg paratha" or "chicken roll": one dish, the bread
      // plus a share of the filling.
      endUnknown(true);
      const filling = match.food;
      const bread = after.food;
      addFood(
        {
          ...bread,
          name: `${tokens.slice(i, i + match.size).join(' ')} ${bread.name}`,
          kcal: Math.round(bread.kcal + filling.kcal * 0.5),
          protein: Math.round(bread.protein + filling.protein * 0.5),
        },
        true,
      );
      i += match.size + after.size - 1;
    } else if (match) {
      endUnknown(true);
      addFood(match.food, false);
      i += match.size - 1;
    } else if (token in WORD_NUMBERS) {
      endUnknown(false);
      entries.push({ kind: 'amount', amount: { count: WORD_NUMBERS[token], grams: null } });
    } else if (token in SIZES) {
      endUnknown(false);
      scale = SIZES[token];
    } else if (NEGATIONS.has(token)) {
      endUnknown(false);
      skip = true;
    } else if (FILLER.has(token)) {
      endUnknown(false);
    } else {
      unknown.push(token);
    }
  }
  endUnknown(false);
  return entries;
}

// "paneer 200g rice 1 cup" ends on an amount, so amounts follow their food; "2 roti 100g dal"
// doesn't, so they come first. Decided per comma-separated part.
function attachAmounts(entries: Entry[]) {
  const foods: Extract<Entry, { kind: 'food' }>[] = [];
  const amountsFollow = entries[entries.length - 1]?.kind === 'amount';
  let pending: Amount | null = null;

  const merge = (a: Amount | null, b: Amount): Amount => ({
    count: a?.count != null && b.count != null ? a.count * b.count : (b.count ?? a?.count ?? null),
    grams: b.grams ?? a?.grams ?? null,
  });

  for (const entry of entries) {
    if (entry.kind === 'food') {
      if (pending) entry.amount = pending;
      pending = null;
      foods.push(entry);
    } else if (amountsFollow && foods.length > 0 && !foods[foods.length - 1].amount) {
      foods[foods.length - 1].amount = entry.amount;
    } else {
      pending = merge(pending, entry.amount);
    }
  }
  return foods;
}

// Turns "cheese naan with gravy 100g" or "2 roti, dal and 200g paneer" into calories and
// protein using the built-in food list, with or without commas. Works offline; anything
// unknown gets a rough guess and is reported back.
export function estimateMeal(input: string): MealEstimate {
  const segments = input.toLowerCase().split(/[,;+&\n()]|\.(?!\d)/);
  const items: EstimateItem[] = [];
  const unmatched: string[] = [];

  for (const segment of segments) {
    for (const entry of attachAmounts(readEntries(tokenize(segment), unmatched))) {
      if (entry.skip) continue;
      const { food, amount, scale } = entry;
      const grams = amount?.grams != null ? amount.grams * (amount.count ?? 1) : null;
      const portions = (grams !== null ? grams / food.grams : (amount?.count ?? 1)) * scale;
      if (!Number.isFinite(portions) || portions <= 0) continue;
      items.push({
        food,
        amount: portions,
        grams,
        kcal: food.kcal * portions,
        protein: food.protein * portions,
        guess: entry.guess,
      });
    }
  }

  return {
    items,
    kcal: Math.round(items.reduce((s, i) => s + i.kcal, 0)),
    protein: Math.round(items.reduce((s, i) => s + i.protein, 0)),
    unmatched,
  };
}

// "2 × roti", "100 g gravy", "1 bowl dal"
export function describeItem(item: EstimateItem) {
  const { food, grams } = item;
  const label = item.guess ? `${food.name} (rough guess)` : food.name;
  if (grams !== null) return `${Math.round(grams)} g ${label}`;
  const amount = Number.isInteger(item.amount) ? item.amount : Math.round(item.amount * 100) / 100;
  // A portion like "1 roti" already names the food; "1 bowl" doesn't.
  const unit = food.portion.replace(/^1 /, '');
  if (food.name.includes(singular(unit))) return `${amount} × ${label}`;
  return `${amount} × ${food.portion} ${label}`;
}
