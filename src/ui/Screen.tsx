import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './Button';
import { Text } from './Text';
import { MAX_CONTENT_WIDTH, useWidthClass } from './layout';
import { spacing, useTheme } from './theme';

type ScreenProps = {
  children: ReactNode;
  testID?: string;
  /** Title bar. Omit for screens that draw their own. */
  title?: string;
  /** Shows a back button. Goes back, or to `backTo` when there is no history. */
  backTo?: string;
  /** Called instead of navigating, for screens that must confirm before leaving. */
  onBack?: () => void;
  /** Buttons at the right of the title bar. */
  actions?: ReactNode;
  /** Wrap the content in a ScrollView. Leave off when the content is a list. */
  scroll?: boolean;
  /** Let the content use the full width on tablets instead of a reading column. */
  wide?: boolean;
};

export function goBack(fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/**
 * Page shell: safe areas, themed background, optional title bar, and a centred
 * column that stops growing on tablets and desktop so lines stay readable.
 */
export function Screen({
  children,
  testID,
  title,
  backTo,
  onBack,
  actions,
  scroll = false,
  wide = false,
}: ScreenProps) {
  const theme = useTheme();
  const widthClass = useWidthClass();
  const padding = widthClass === 'compact' ? spacing.md : spacing.xl;
  const maxWidth = wide ? 1200 : MAX_CONTENT_WIDTH;
  const hasHeader = title !== undefined || backTo !== undefined || actions !== undefined;

  const header = hasHeader ? (
    <View style={[styles.header, { paddingHorizontal: padding, maxWidth }]}>
      {backTo !== undefined && (
        <Button
          label="‹ Back"
          accessibilityLabel="Back"
          variant="ghost"
          compact
          testID="back-button"
          onPress={onBack ?? (() => goBack(backTo))}
        />
      )}
      <Text variant="heading" numberOfLines={1} style={styles.headerTitle}>
        {title ?? ''}
      </Text>
      <View style={styles.headerActions}>{actions}</View>
    </View>
  ) : null;

  const column = [styles.column, { paddingHorizontal: padding, maxWidth }];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} testID={testID}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[column, styles.scrollContent]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[column, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  header: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    minHeight: 56,
  },
  headerTitle: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  column: {
    width: '100%',
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xxl },
});
