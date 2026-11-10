import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from 'react-native';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export type ThemeMode = 'light' | 'dark' | 'comic';
export type ThemeChoice = ThemeMode | 'system';

const dark = {
  background: '#0F0F14',
  card: '#1C1C24',
  border: '#2A2A34',
  checkboxBorder: '#3A3A46',
  text: '#EDEDF0',
  textMuted: '#6E6E7A',
  iconMuted: '#4A4A56',
  accent: '#5DCAA5',
  accentDark: '#085041',
  accentLight: '#9FE1CB',
  onAccent: '#04342C',
  streak: '#EF9F27',
  danger: '#F09595',
  dangerBg: '#2A1A1C',
  proBg: '#2E2312',
  doneBg: '#11231E',
  water: '#85B7EB',
  waterDark: '#0C447C',
  // Year heatmap, empty to full.
  heat: ['#1F2A27', '#0F4A3B', '#167A5E', '#2FA383', '#5DCAA5'],
};

const light: typeof dark = {
  background: '#F5F5F8',
  card: '#FFFFFF',
  border: '#E2E2E8',
  checkboxBorder: '#BDBDC8',
  text: '#16161C',
  textMuted: '#62626E',
  iconMuted: '#9494A0',
  accent: '#128A6B',
  accentDark: '#D3F1E6',
  accentLight: '#0E6E55',
  onAccent: '#FFFFFF',
  streak: '#B96A00',
  danger: '#C43D3D',
  dangerBg: '#FBE8E8',
  proBg: '#FBEFD9',
  doneBg: '#E4F5EE',
  water: '#2472C8',
  waterDark: '#DCEBFA',
  heat: ['#E8EEEB', '#BDE7D7', '#7FD1B5', '#3CAB88', '#128A6B'],
};

// Comic book: hot pink, electric blue and yellow ink on a deep black page.
const comic: typeof dark = {
  background: '#0A0A10',
  card: '#17121F',
  border: '#2E3A8C',
  checkboxBorder: '#4A5BD0',
  text: '#FFF6E5',
  textMuted: '#A99FBC',
  iconMuted: '#5E5470',
  accent: '#FF2E88',
  accentDark: '#4A0E2C',
  accentLight: '#FF8CC2',
  onAccent: '#1A0010',
  streak: '#FFE14D',
  danger: '#FF6B5B',
  dangerBg: '#2E1416',
  proBg: '#2A2410',
  doneBg: '#1E0F22',
  water: '#2FB8FF',
  waterDark: '#0A3A5C',
  heat: ['#1E1828', '#4A1636', '#8A1E5A', '#D02676', '#FF2E88'],
};

const PALETTES: Record<ThemeMode, typeof dark> = { dark, light, comic };

// The current palette. Read it while rendering, not when a file loads, so it can change.
export const colors = { ...dark };

let current: ThemeMode = 'dark';
let version = 0;

// The root layout calls this, then remounts the screens so they all pick up the new colours.
export function applyTheme(mode: ThemeMode) {
  if (mode === current) return;
  current = mode;
  version++;
  Object.assign(colors, PALETTES[mode]);
  // Comic panels have sharp corners.
  radius.card = mode === 'comic' ? 4 : 12;
}

// Like StyleSheet.create, but rebuilt when the theme changes.
export function themedStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  build: () => T & NamedStyles<any>,
): T {
  let sheet = {} as T;
  let builtFor = -1;
  return new Proxy({} as object, {
    get(_target, key) {
      if (builtFor !== version) {
        sheet = StyleSheet.create(build()) as T;
        builtFor = version;
      }
      return sheet[key as keyof T];
    },
  }) as T;
}

export const radius = {
  card: 12,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};
