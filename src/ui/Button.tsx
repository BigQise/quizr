import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { MIN_TOUCH_TARGET, radius, spacing, useTheme, type Theme } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Read by screen readers in place of the label, when the label is a symbol. */
  accessibilityLabel?: string;
  /** Marks a toggle or a chosen option. */
  selected?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

function colors(theme: Theme, variant: Variant, selected: boolean) {
  if (selected)
    return { background: theme.accentSoft, border: theme.accent, tone: 'accent' as const };
  switch (variant) {
    case 'primary':
      return { background: theme.accent, border: theme.accent, tone: 'onAccent' as const };
    case 'danger':
      return { background: theme.dangerSoft, border: theme.danger, tone: 'danger' as const };
    case 'success':
      return { background: theme.successSoft, border: theme.success, tone: 'success' as const };
    case 'ghost':
      return { background: 'transparent', border: 'transparent', tone: 'accent' as const };
    default:
      return { background: theme.surface, border: theme.border, tone: 'default' as const };
  }
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  accessibilityLabel,
  selected = false,
  testID,
  style,
  compact = false,
}: ButtonProps) {
  const theme = useTheme();
  const { background, border, tone } = colors(theme, variant, selected);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: background, borderColor: border },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text variant="label" tone={tone} center numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { paddingHorizontal: spacing.sm },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
