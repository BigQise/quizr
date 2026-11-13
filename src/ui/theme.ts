import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    background: '#F7F7FA',
    surface: '#FFFFFF',
    border: '#DCDCE5',
    text: '#16161D',
    textMuted: '#5D5D6B',
    accent: '#3B5BDB',
    onAccent: '#FFFFFF',
    danger: '#C92A2A',
  },
  dark: {
    background: '#101014',
    surface: '#1B1B22',
    border: '#30303B',
    text: '#F2F2F7',
    textMuted: '#A0A0AE',
    accent: '#748FFC',
    onAccent: '#0B0B10',
    danger: '#FF8787',
  },
} as const;

export type Theme = { [K in keyof typeof palette.light]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 20 } as const;

/** Smallest comfortable touch target, in density-independent pixels. */
export const MIN_TOUCH_TARGET = 48;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
