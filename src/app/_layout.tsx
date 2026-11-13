import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DatabaseProvider } from '@/data/DatabaseProvider';
import { Screen } from '@/ui/Screen';
import { useTheme } from '@/ui/theme';

export default function RootLayout() {
  const theme = useTheme();

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <DatabaseProvider
          pending={
            <Screen testID="database-pending">
              <Text style={[styles.message, { color: theme.textMuted }]}>
                Preparing your library…
              </Text>
            </Screen>
          }
          renderError={(error) => (
            <Screen testID="database-error">
              <Text style={[styles.message, { color: theme.danger }]}>
                Quizr could not open its database: {error.message}
              </Text>
            </Screen>
          )}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.background },
            }}
          />
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  message: { fontSize: 16, lineHeight: 24 },
});
