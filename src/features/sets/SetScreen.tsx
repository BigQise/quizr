import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useRepos } from '@/data/ReposProvider';
import type { CardRecord, TestAttemptSummary } from '@/data/repos';
import { Button } from '@/ui/Button';
import { ConfirmDialog, Dialog } from '@/ui/Dialog';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { EmptyState, ProgressBar, Surface, TextField } from '@/ui/controls';
import { useWidthClass } from '@/ui/layout';
import { spacing } from '@/ui/theme';

import { cardCountLabel } from './LibraryScreen';
import { MIN_CARDS_FOR_QUESTIONS, useSetData } from './useSetData';

function CardRow({
  card,
  isFirst,
  isLast,
  onChanged,
}: {
  card: CardRecord;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const repos = useRepos();
  const run = (action: Promise<void>) => action.then(onChanged);

  return (
    <Surface style={styles.cardRow} testID="card-row">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit card: ${card.term}`}
        style={styles.cardText}
        onPress={() => router.push(`/sets/${card.setId}/card?cardId=${card.id}`)}
      >
        <Text variant="label" numberOfLines={3}>
          {card.term}
        </Text>
        <Text tone="muted" numberOfLines={3}>
          {card.definition}
        </Text>
      </Pressable>
      <View style={styles.cardButtons}>
        <Button
          label={card.starred ? '★' : '☆'}
          accessibilityLabel={card.starred ? `Unstar ${card.term}` : `Star ${card.term}`}
          variant="ghost"
          compact
          selected={card.starred}
          testID="star-card"
          onPress={() => run(repos.setStarred(card.id, !card.starred))}
        />
        <Button
          label="↑"
          accessibilityLabel={`Move ${card.term} up`}
          variant="ghost"
          compact
          disabled={isFirst}
          onPress={() => run(repos.moveCard(card.id, -1))}
        />
        <Button
          label="↓"
          accessibilityLabel={`Move ${card.term} down`}
          variant="ghost"
          compact
          disabled={isLast}
          onPress={() => run(repos.moveCard(card.id, 1))}
        />
      </View>
    </Surface>
  );
}

function StudyLauncher({ setId, cards }: { setId: string; cards: CardRecord[] }) {
  const count = cards.length;
  const canAsk = count >= MIN_CARDS_FOR_QUESTIONS;
  const mastered = cards.filter((card) => card.learnStage === 2).length;
  // Three buttons side by side do not fit a phone without breaking a word.
  const stacked = useWidthClass() === 'compact';

  return (
    <Surface>
      <Text variant="heading">Study</Text>
      <View style={[styles.launcher, stacked && styles.launcherStacked]}>
        <Button
          label="Flashcards"
          variant="primary"
          disabled={count === 0}
          testID="study-flashcards"
          style={stacked ? undefined : styles.launcherButton}
          onPress={() => router.push(`/sets/${setId}/flashcards`)}
        />
        <Button
          label="Learn"
          variant="primary"
          disabled={!canAsk}
          testID="study-learn"
          style={stacked ? undefined : styles.launcherButton}
          onPress={() => router.push(`/sets/${setId}/learn`)}
        />
        <Button
          label="Test"
          variant="primary"
          disabled={!canAsk}
          testID="study-test"
          style={stacked ? undefined : styles.launcherButton}
          onPress={() => router.push(`/sets/${setId}/test`)}
        />
      </View>
      {!canAsk ? (
        <Text variant="caption" tone="muted" testID="study-hint">
          {count === 0
            ? 'Add some cards to start studying.'
            : `Learn and Test need at least ${MIN_CARDS_FOR_QUESTIONS} cards, so there are wrong answers to choose from.`}
        </Text>
      ) : (
        <View style={styles.progress}>
          <Text variant="caption" tone="muted" testID="learn-progress">
            Learn: {mastered} of {count} mastered
          </Text>
          <ProgressBar value={count === 0 ? 0 : mastered / count} label="Cards mastered in Learn" />
        </View>
      )}
    </Surface>
  );
}

function TestHistory({ setId, attempts }: { setId: string; attempts: TestAttemptSummary[] }) {
  if (attempts.length === 0) return null;
  return (
    <Surface testID="test-history">
      <Text variant="heading">Past tests</Text>
      {attempts.slice(0, 5).map((attempt) => {
        const percent =
          attempt.possible === 0 ? 0 : Math.round((attempt.earned / attempt.possible) * 100);
        return (
          <Button
            key={attempt.id}
            label={`${percent}%  ·  ${attempt.earned}/${attempt.possible}  ·  ${new Date(attempt.submittedAt).toLocaleDateString()}`}
            onPress={() => router.push(`/sets/${setId}/test?attemptId=${attempt.id}`)}
          />
        );
      })}
    </Surface>
  );
}

export function SetScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const repos = useRepos();
  const widthClass = useWidthClass();
  const { data, error, reload } = useSetData(setId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (error) {
    return (
      <Screen title="Set" backTo="/">
        <Text tone="danger">Could not load this set: {error.message}</Text>
      </Screen>
    );
  }
  if (data === undefined) {
    return (
      <Screen title="" backTo="/">
        <Text tone="muted">Loading…</Text>
      </Screen>
    );
  }
  if (data.set === null) {
    return (
      <Screen title="Set not found" backTo="/" testID="set-missing">
        <EmptyState title="This set no longer exists." body="It may have been deleted." />
      </Screen>
    );
  }

  const { set, cards, attempts } = data;

  const startEditing = () => {
    setTitle(set.title);
    setDescription(set.description);
    setEditing(true);
  };

  const saveDetails = async () => {
    if (title.trim() === '') return;
    await repos.updateSet(set.id, { title: title.trim(), description: description.trim() });
    setEditing(false);
    reload();
  };

  const deleteSet = async () => {
    await repos.deleteSet(set.id);
    setConfirmingDelete(false);
    router.replace('/');
  };

  const overview = (
    <View style={styles.overview}>
      {set.description ? <Text tone="muted">{set.description}</Text> : null}
      <StudyLauncher setId={set.id} cards={cards} />
      <TestHistory setId={set.id} attempts={attempts} />
    </View>
  );

  const cardsHeader = (
    <View style={styles.cardsHeader}>
      <Text variant="heading" testID="card-count">
        {cardCountLabel(cards.length)}
      </Text>
      <View style={styles.cardsActions}>
        <Button
          label="Import"
          testID="import-cards"
          onPress={() => router.push(`/sets/${set.id}/import`)}
        />
        <Button
          label="Add card"
          variant="primary"
          testID="add-card"
          onPress={() => router.push(`/sets/${set.id}/card`)}
        />
      </View>
    </View>
  );

  const twoPane = widthClass === 'expanded';

  const cardList = (
    <FlatList
      data={cards}
      keyExtractor={(card) => card.id}
      initialNumToRender={20}
      windowSize={7}
      style={styles.fill}
      contentContainerStyle={styles.cardList}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          {twoPane ? null : overview}
          {cardsHeader}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title="No cards yet."
          body="Add cards one at a time, or import a pasted list."
        />
      }
      renderItem={({ item, index }) => (
        <CardRow
          card={item}
          isFirst={index === 0}
          isLast={index === cards.length - 1}
          onChanged={reload}
        />
      )}
    />
  );

  return (
    <Screen
      testID="set-screen"
      title={set.title}
      backTo="/"
      wide
      actions={
        <>
          <Button
            label="Rename"
            variant="ghost"
            compact
            testID="rename-set"
            onPress={startEditing}
          />
          <Button
            label="Delete"
            variant="ghost"
            compact
            testID="delete-set"
            onPress={() => setConfirmingDelete(true)}
          />
        </>
      }
    >
      {twoPane ? (
        <View style={styles.panes}>
          <ScrollView style={styles.sidePane} contentContainerStyle={styles.sidePaneContent}>
            {overview}
          </ScrollView>
          {cardList}
        </View>
      ) : (
        cardList
      )}

      <Dialog visible={editing} title="Rename set" onClose={() => setEditing(false)}>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          testID="rename-title-input"
        />
        <TextField label="Description" value={description} onChangeText={setDescription} />
        <View style={styles.dialogActions}>
          <Button label="Cancel" onPress={() => setEditing(false)} />
          <Button
            label="Save"
            variant="primary"
            disabled={title.trim() === ''}
            testID="rename-save"
            onPress={saveDetails}
          />
        </View>
      </Dialog>

      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this set?"
        message={`"${set.title}", its ${cardCountLabel(cards.length)}, and all study progress will be removed. This cannot be undone.`}
        confirmLabel="Delete set"
        destructive
        onConfirm={deleteSet}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panes: { flex: 1, flexDirection: 'row', gap: spacing.lg },
  sidePane: { flexGrow: 0, flexBasis: 380 },
  sidePaneContent: { paddingBottom: spacing.xxl },
  overview: { gap: spacing.md },
  launcher: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  launcherStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
  launcherButton: { flexGrow: 1, flexBasis: 96 },
  progress: { gap: spacing.xs },
  listHeader: { gap: spacing.md },
  cardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardsActions: { flexDirection: 'row', gap: spacing.sm },
  cardList: { gap: spacing.sm, paddingBottom: spacing.xxl },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardText: { flex: 1, gap: 2 },
  cardButtons: { flexDirection: 'row' },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
