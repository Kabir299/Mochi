import type { IconName } from '@/state/habits';

// Icons offered when creating a habit; also the list the AI may pick from.
export const HABIT_ICONS: IconName[] = [
  'checkmark-circle-outline',
  'book-outline',
  'barbell-outline',
  'water-outline',
  'leaf-outline',
  'walk-outline',
  'bicycle-outline',
  'bed-outline',
  'nutrition-outline',
  'cafe-outline',
  'pencil-outline',
  'code-slash-outline',
  'musical-notes-outline',
  'language-outline',
  'brush-outline',
  'heart-outline',
  'sunny-outline',
  'moon-outline',
  'cash-outline',
  'phone-portrait-outline',
];

// Picks an icon from the task's name so the quick add flow doesn't have to ask.
const ICON_WORDS: [RegExp, IconName][] = [
  [/read|book|novel|page/i, 'book-outline'],
  [/gym|workout|lift|strength|push.?up|exercise|train/i, 'barbell-outline'],
  [/water|drink|hydrat/i, 'water-outline'],
  [/meditat|breath|yoga|mindful/i, 'leaf-outline'],
  [/walk|step|run|jog/i, 'walk-outline'],
  [/cycl|bike|ride/i, 'bicycle-outline'],
  [/sleep|nap|bed/i, 'bed-outline'],
  [/eat|meal|cook|protein|fruit|veg|diet|lunch|dinner|breakfast/i, 'nutrition-outline'],
  [/coffee|tea|break/i, 'cafe-outline'],
  [/journal|write|diary|note|essay/i, 'pencil-outline'],
  [/code|work|project|study|deep|email|assignment|homework|exam/i, 'code-slash-outline'],
  [/guitar|piano|music|sing|practi[cs]e/i, 'musical-notes-outline'],
  [/learn|language|spanish|french|course|class|lecture/i, 'language-outline'],
  [/draw|paint|art|design|clean|tidy/i, 'brush-outline'],
  [/call|family|friend|parent|love|date/i, 'heart-outline'],
  [/wake|morning|sun/i, 'sunny-outline'],
  [/night|evening/i, 'moon-outline'],
  [/money|budget|pay|bill|save|invest/i, 'cash-outline'],
  [/phone|screen|social|scroll/i, 'phone-portrait-outline'],
];

export function guessIcon(name: string): IconName {
  return ICON_WORDS.find(([pattern]) => pattern.test(name))?.[1] ?? 'checkmark-circle-outline';
}
