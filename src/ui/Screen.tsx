import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useWidthClass } from './layout';
import { spacing, useTheme } from './theme';

type ScreenProps = {
  children: ReactNode;
  testID?: string;
};

/**
 * Page shell: safe areas, themed background, and a centred column that stops
 * growing on tablets and desktop so lines stay readable.
 */
export function Screen({ children, testID }: ScreenProps) {
  const theme = useTheme();
  const widthClass = useWidthClass();
  const horizontalPadding = widthClass === 'compact' ? spacing.md : spacing.xl;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} testID={testID}>
      <View style={[styles.column, { paddingHorizontal: horizontalPadding }]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingVertical: spacing.lg,
  },
});
