import { router, type ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Screen } from './Screen';
import { Text } from './Text';
import { spacing } from './theme';

/**
 * Shown by Expo Router when a screen throws while rendering, so one broken
 * screen never leaves the app blank. Exported as `ErrorBoundary` from the root
 * layout.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  return (
    <Screen testID="error-screen">
      <View style={styles.root}>
        <Text variant="title">Something went wrong</Text>
        <Text tone="muted">
          This screen hit an unexpected problem. Your sets and cards are safe on this device.
        </Text>
        <Text variant="caption" tone="danger">
          {error.message}
        </Text>
        <Button label="Try again" variant="primary" onPress={retry} />
        <Button label="Go to the library" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: spacing.md },
});
