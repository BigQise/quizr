import { useColorScheme } from 'react-native';

export const palette = {
  light: {
    background: '#F7F7FA',
    surface: '#FFFFFF',
    surfaceMuted: '#EEEEF4',
    border: '#D5D5E0',
    text: '#16161D',
    textMuted: '#5D5D6B',
    accent: '#3B5BDB',
    accentSoft: '#E3E9FD',
    onAccent: '#FFFFFF',
    danger: '#C92A2A',
    dangerSoft: '#FDE8E8',
    success: '#2B8A3E',
    successSoft: '#E3F5E7',
    warning: '#A15C00',
    scrim: 'rgba(10, 10, 20, 0.5)',
  },
  dark: {
    background: '#101014',
    surface: '#1B1B22',
    surfaceMuted: '#26262F',
    border: '#3A3A47',
    text: '#F2F2F7',
    textMuted: '#A8A8B6',
    accent: '#8DA2FF',
    accentSoft: '#252C4D',
    onAccent: '#0B0B10',
    danger: '#FF8787',
    dangerSoft: '#3D1F1F',
    success: '#69DB7C',
    successSoft: '#1C3322',
    warning: '#FFC078',
    scrim: 'rgba(0, 0, 0, 0.65)',
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
