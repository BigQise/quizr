import { StyleSheet, Text as NativeText, type TextProps as NativeTextProps } from 'react-native';

import { useTheme, type Theme } from './theme';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'display';
type Tone = 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'onAccent';

type TextProps = NativeTextProps & {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
};

function colorFor(theme: Theme, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return theme.textMuted;
    case 'accent':
      return theme.accent;
    case 'danger':
      return theme.danger;
    case 'success':
      return theme.success;
    case 'onAccent':
      return theme.onAccent;
    default:
      return theme.text;
  }
}

/** Themed text. Sizes scale with the system font setting. */
export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <NativeText
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      maxFontSizeMultiplier={2}
      style={[styles[variant], { color: colorFor(theme, tone) }, center && styles.center, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20 },
  center: { textAlign: 'center' },
});
