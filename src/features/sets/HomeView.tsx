import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/ui/Screen';
import { useWidthClass } from '@/ui/layout';
import { radius, spacing, useTheme } from '@/ui/theme';

type HomeViewProps = {
  /** Number of sets in the library, or null while it is still being read. */
  setCount: number | null;
};

function describeSetCount(setCount: number | null): string {
  if (setCount === null) return 'Loading…';
  if (setCount === 0) return 'No study sets yet.';
  if (setCount === 1) return '1 study set';
  return `${setCount} study sets`;
}

export function HomeView({ setCount }: HomeViewProps) {
  const theme = useTheme();
  const widthClass = useWidthClass();

  return (
    <Screen testID="home-screen">
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        Quizr
      </Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>Your library</Text>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
          widthClass !== 'compact' && styles.cardWide,
        ]}
      >
        <Text testID="set-count" style={[styles.body, { color: theme.text }]}>
          {describeSetCount(setCount)}
        </Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Creating sets arrives in the next build phase.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  subtitle: { fontSize: 16, lineHeight: 24, marginTop: spacing.xs },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  cardWide: { padding: spacing.lg },
  body: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  hint: { fontSize: 14, lineHeight: 20 },
});
