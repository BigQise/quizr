import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useLoadOnFocus, useRepos } from '@/data/ReposProvider';
import type { SetSummary } from '@/data/repos';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { Badge, EmptyState, Surface } from '@/ui/controls';
import { useWidthClass } from '@/ui/layout';
import { spacing } from '@/ui/theme';

export function cardCountLabel(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`;
}

function SetTile({ set }: { set: SetSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${set.title}, ${cardCountLabel(set.cardCount)}`}
      testID={`set-tile-${set.title}`}
      onPress={() => router.push(`/sets/${set.id}`)}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <Surface style={styles.tileSurface}>
        <Text variant="heading" numberOfLines={2}>
          {set.title}
        </Text>
        {set.description ? (
          <Text tone="muted" numberOfLines={2}>
            {set.description}
          </Text>
        ) : null}
        <View style={styles.tileFooter}>
          <Text variant="caption" tone="muted">
            {cardCountLabel(set.cardCount)}
          </Text>
          {set.dueCount > 0 ? <Badge label={`${set.dueCount} due`} /> : null}
        </View>
      </Surface>
    </Pressable>
  );
}

export function LibraryScreen() {
  const repos = useRepos();
  const widthClass = useWidthClass();
  const { data: sets, error } = useLoadOnFocus('library', () => repos.listSets());
  const columns = widthClass === 'expanded' ? 3 : widthClass === 'medium' ? 2 : 1;
  const totalDue = (sets ?? []).reduce((sum, set) => sum + set.dueCount, 0);

  return (
    <Screen
      testID="home-screen"
      title="Quizr"
      wide
      actions={
        <>
          <Button
            label="Settings"
            variant="ghost"
            compact
            testID="open-settings"
            onPress={() => router.push('/settings')}
          />
          <Button
            label="New set"
            variant="primary"
            testID="new-set"
            onPress={() => router.push('/sets/new')}
          />
        </>
      }
    >
      {error ? (
        <Text tone="danger">Could not load your library: {error.message}</Text>
      ) : sets === undefined ? (
        <Text tone="muted">Loading…</Text>
      ) : sets.length === 0 ? (
        <View testID="library-empty">
          <EmptyState
            title="No study sets yet."
            body="Create a set, add some cards, and start studying."
          />
        </View>
      ) : (
        <FlatList
          // Changing the column count needs a fresh list.
          key={columns}
          data={sets}
          numColumns={columns}
          keyExtractor={(set) => set.id}
          renderItem={({ item }) => <SetTile set={item} />}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            totalDue > 0 ? (
              <Text tone="muted" testID="due-today">
                {totalDue === 1
                  ? '1 card is due for review.'
                  : `${totalDue} cards are due for review.`}
              </Text>
            ) : undefined
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingBottom: spacing.xxl },
  row: { gap: spacing.md },
  tile: { flex: 1 },
  tileSurface: { flex: 1, minHeight: 112 },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  pressed: { opacity: 0.7 },
});
