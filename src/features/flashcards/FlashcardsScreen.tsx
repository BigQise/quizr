import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DeckState } from '@/core/flashcards/deck';
import { startOfLocalDay } from '@/core/srs/scheduler';
import { useLoad, useRepos } from '@/data/ReposProvider';
import {
  DEFAULT_NEW_CARDS_PER_DAY,
  SETTING_NEW_CARDS_PER_DAY,
  type CardRecord,
  type SrsRecord,
} from '@/data/repos';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { EmptyState, Segmented, SwitchRow } from '@/ui/controls';

import { DeckStudy } from './DeckStudy';
import { SrsStudy } from './SrsStudy';
import {
  deckKey,
  readSavedDeck,
  readSavedOptions,
  type FlashcardOptions,
  type SavedFlashcards,
  type StudyMethod,
} from './options';

const METHOD_OPTIONS: { value: StudyMethod; label: string }[] = [
  { value: 'browse', label: 'Browse' },
  { value: 'sort', label: 'Sort' },
  { value: 'srs', label: 'Spaced repetition' },
];

const SIDE_OPTIONS = [
  { value: 'term' as const, label: 'Term' },
  { value: 'definition' as const, label: 'Definition' },
];

type Loaded = {
  title: string | null;
  cards: CardRecord[];
  saved: unknown;
  srs: Record<string, SrsRecord>;
  newCardsPerDay: number;
  introducedToday: number;
};

function FlashcardsLoaded({ setId, loaded }: { setId: string; loaded: Loaded }) {
  const repos = useRepos();
  const [options, setOptions] = useState<FlashcardOptions>(() => readSavedOptions(loaded.saved));
  const [showOptions, setShowOptions] = useState(false);

  const scoped = options.starredOnly ? loaded.cards.filter((card) => card.starred) : loaded.cards;

  // The saved deck is only reused while the options that shaped it are unchanged.
  const savedKey = deckKey(readSavedOptions(loaded.saved));
  const initialDeck: DeckState | null =
    deckKey(options) === savedKey
      ? readSavedDeck(
          loaded.saved,
          scoped.map((card) => card.id),
        )
      : null;

  const change = (patch: Partial<FlashcardOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    if (next.method === 'srs') {
      // Spaced repetition keeps no deck; remember only the options.
      const saved: SavedFlashcards = { version: 1, options: next, deck: null };
      repos.saveSession(setId, 'flashcards', saved).catch(() => {});
    }
  };

  return (
    <Screen
      testID="flashcards-screen"
      title={loaded.title ?? 'Flashcards'}
      backTo={`/sets/${setId}`}
      actions={
        <Button
          label="Options"
          variant="ghost"
          compact
          testID="flashcards-options"
          onPress={() => setShowOptions(true)}
        />
      }
    >
      {scoped.length === 0 ? (
        <EmptyState
          title={options.starredOnly ? 'No starred cards.' : 'No cards yet.'}
          body={
            options.starredOnly
              ? 'Star some cards in the set, or turn off “Starred only” in Options.'
              : 'Add cards to this set to study them.'
          }
        />
      ) : options.method === 'srs' ? (
        <SrsStudy
          key={`srs|${options.starredOnly}`}
          cards={scoped}
          options={options}
          initialRecords={loaded.srs}
          newCardsPerDay={loaded.newCardsPerDay}
          introducedToday={loaded.introducedToday}
          onBrowse={() => change({ method: 'browse' })}
        />
      ) : (
        <DeckStudy
          key={deckKey(options)}
          setId={setId}
          cards={scoped}
          options={options}
          initialDeck={initialDeck}
        />
      )}

      <Dialog
        visible={showOptions}
        title="Flashcard options"
        onClose={() => setShowOptions(false)}
        testID="flashcards-options-dialog"
      >
        <Segmented
          label="Study method"
          options={METHOD_OPTIONS}
          value={options.method}
          onChange={(method) => change({ method })}
          testID="method"
        />
        <Text variant="caption" tone="muted">
          {options.method === 'browse'
            ? 'Flip through every card.'
            : options.method === 'sort'
              ? 'Sort each card into Know or Still learning, then review the ones you missed.'
              : 'Rate how well you remembered each card. Cards come back just before you would forget them.'}
        </Text>
        <Segmented
          label="Show first"
          options={SIDE_OPTIONS}
          value={options.frontSide}
          onChange={(frontSide) => change({ frontSide })}
          testID="front-side"
        />
        {options.method !== 'srs' ? (
          <SwitchRow
            label="Shuffle"
            value={options.shuffle}
            onValueChange={(shuffle) => change({ shuffle })}
            testID="option-shuffle"
          />
        ) : null}
        <SwitchRow
          label="Starred only"
          value={options.starredOnly}
          onValueChange={(starredOnly) => change({ starredOnly })}
          testID="option-starred"
        />
        <View style={styles.dialogActions}>
          <Button
            label="Done"
            variant="primary"
            testID="options-done"
            onPress={() => setShowOptions(false)}
          />
        </View>
      </Dialog>
    </Screen>
  );
}

export function FlashcardsScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const repos = useRepos();

  const { data, error } = useLoad(`flashcards:${setId}`, async (): Promise<Loaded> => {
    const dayStart = startOfLocalDay(Date.now(), new Date().getTimezoneOffset());
    const [set, cards, saved, srs, limit, introducedToday] = await Promise.all([
      repos.getSet(setId),
      repos.listCards(setId),
      repos.loadSession(setId, 'flashcards'),
      repos.listSrs(setId),
      repos.getSetting(SETTING_NEW_CARDS_PER_DAY),
      repos.countIntroducedSince(dayStart),
    ]);
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    return {
      title: set?.title ?? null,
      cards,
      saved,
      srs,
      newCardsPerDay: Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_NEW_CARDS_PER_DAY,
      introducedToday,
    };
  });

  if (error) {
    return (
      <Screen title="Flashcards" backTo={`/sets/${setId}`}>
        <Text tone="danger">Could not load the cards: {error.message}</Text>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen title="Flashcards" backTo={`/sets/${setId}`}>
        <Text tone="muted">Loading…</Text>
      </Screen>
    );
  }
  return <FlashcardsLoaded setId={setId} loaded={data} />;
}

const styles = StyleSheet.create({
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
