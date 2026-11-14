import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  createDeck,
  currentCardId,
  deckReducer,
  isRoundFinished,
  type DeckEvent,
  type DeckState,
  type Pile,
} from '@/core/flashcards/deck';
import { otherSide, textOn } from '@/core/model';
import { useRepos } from '@/data/ReposProvider';
import type { CardRecord } from '@/data/repos';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { ProgressBar, Surface, SwitchRow } from '@/ui/controls';
import { spacing } from '@/ui/theme';
import { useKeyboardShortcuts } from '@/ui/useKeyboardShortcuts';

import { FlipCard } from './FlipCard';
import type { FlashcardOptions, SavedFlashcards } from './options';

const AUTOPLAY_MS = 2500;

export function sideLabel(side: 'term' | 'definition'): string {
  return side === 'term' ? 'Term' : 'Definition';
}

export function newSeed(): number {
  return Math.floor(Date.now() % 2_147_483_647);
}

type DeckStudyProps = {
  setId: string;
  /** The cards in scope (already filtered to starred, if that option is on). */
  cards: CardRecord[];
  options: FlashcardOptions;
  initialDeck: DeckState | null;
};

/** Flashcards in browse or sort mode. */
export function DeckStudy({ setId, cards, options, initialDeck }: DeckStudyProps) {
  const repos = useRepos();
  const method = options.method === 'sort' ? 'sort' : 'browse';
  const deckOptions = { method, frontSide: options.frontSide, shuffle: options.shuffle } as const;
  const cardIds = cards.map((card) => card.id);

  const [deck, setDeck] = useState(
    () => initialDeck ?? createDeck(cardIds, deckOptions, newSeed()),
  );
  const [autoplay, setAutoplay] = useState(false);

  // Keeps the saved copy in step with the options, and covers the first render.
  useEffect(() => {
    const saved: SavedFlashcards = { version: 1, options, deck };
    repos.saveSession(setId, 'flashcards', saved).catch(() => {});
  }, [deck, options, repos, setId]);

  /**
   * Applies an action and starts saving the result in the same tick, so the
   * write is already on its way if the app is closed straight afterwards.
   */
  const dispatch = (event: DeckEvent) => {
    const next = deckReducer(deck, event);
    if (next === deck) return;
    setDeck(next);
    const saved: SavedFlashcards = { version: 1, options, deck: next };
    repos.saveSession(setId, 'flashcards', saved).catch(() => {});
  };

  const finished = isRoundFinished(deck);
  const cardId = currentCardId(deck);
  const card = cards.find((candidate) => candidate.id === cardId);
  const sorting = method === 'sort';

  const flip = () => dispatch({ type: 'flip' });
  const next = () => dispatch({ type: 'next' });
  const previous = () => dispatch({ type: 'previous' });

  const sort = (pile: Pile) => {
    if (!cardId) return;
    dispatch({ type: 'sort', pile });
    repos.setSortStatus(cardId, pile).catch(() => {});
  };

  const undo = () => {
    const lastId = deck.order[deck.index - 1];
    if (!lastId) return;
    dispatch({ type: 'undo' });
    repos.setSortStatus(lastId, 'unsorted').catch(() => {});
  };

  const restart = () => {
    if (sorting) repos.resetSortStatus(setId).catch(() => {});
    dispatch({ type: 'restart', cardIds, options: deckOptions, seed: newSeed() });
  };

  const speak = () => {
    if (!card) return;
    const side = deck.flipped ? otherSide(options.frontSide) : options.frontSide;
    Speech.stop();
    Speech.speak(textOn(card, side));
  };

  // Autoplay: show the front, then the back, then move on.
  useEffect(() => {
    if (!autoplay || sorting || finished) return;
    const timer = setTimeout(() => {
      setDeck((current) =>
        deckReducer(current, current.flipped ? { type: 'next' } : { type: 'flip' }),
      );
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplay, sorting, finished, deck.flipped, deck.index]);

  useKeyboardShortcuts({
    Space: flip,
    ArrowRight: () => (sorting ? sort('know') : next()),
    ArrowLeft: () => (sorting ? sort('stillLearning') : previous()),
    Backspace: () => sorting && undo(),
  });

  if (finished || !card) {
    return (
      <View style={styles.summary} testID="flashcards-summary">
        <Text variant="title" center>
          {sorting ? 'Round complete' : 'You have seen every card'}
        </Text>
        {sorting ? (
          <Surface>
            <Text testID="summary-know">Know: {deck.know.length}</Text>
            <Text testID="summary-still-learning">Still learning: {deck.stillLearning.length}</Text>
          </Surface>
        ) : (
          <Text tone="muted" center>
            {cards.length === 1 ? '1 card' : `${cards.length} cards`} reviewed.
          </Text>
        )}
        {sorting && deck.stillLearning.length > 0 ? (
          <Button
            label={`Review still learning (${deck.stillLearning.length})`}
            variant="primary"
            testID="review-still-learning"
            onPress={() => dispatch({ type: 'reviewStillLearning', seed: newSeed() })}
          />
        ) : null}
        <Button label="Restart" testID="restart-deck" onPress={restart} />
        {sorting && deck.index > 0 ? (
          <Button label="Undo last" variant="ghost" onPress={undo} />
        ) : null}
      </View>
    );
  }

  const backSide = otherSide(options.frontSide);

  return (
    <View style={styles.root}>
      <View style={styles.progress}>
        <Text variant="caption" tone="muted" testID="deck-progress">
          {deck.index + 1} / {deck.order.length}
        </Text>
        <ProgressBar value={deck.index / deck.order.length} label="Progress through the deck" />
      </View>

      <FlipCard
        key={card.id}
        front={textOn(card, options.frontSide)}
        back={textOn(card, backSide)}
        frontLabel={sideLabel(options.frontSide)}
        backLabel={sideLabel(backSide)}
        flipped={deck.flipped}
        onFlip={flip}
        onSwipeRight={() => (sorting ? sort('know') : previous())}
        onSwipeLeft={() => (sorting ? sort('stillLearning') : next())}
      />

      {sorting ? (
        <View style={styles.controls}>
          <Button
            label="Still learning"
            variant="danger"
            testID="sort-still-learning"
            style={styles.grow}
            onPress={() => sort('stillLearning')}
          />
          <Button
            label="↶"
            accessibilityLabel="Undo last"
            disabled={deck.index === 0}
            testID="sort-undo"
            onPress={undo}
          />
          <Button
            label="Know"
            variant="success"
            testID="sort-know"
            style={styles.grow}
            onPress={() => sort('know')}
          />
        </View>
      ) : (
        <View style={styles.controls}>
          <Button
            label="‹"
            accessibilityLabel="Previous card"
            disabled={deck.index === 0}
            testID="deck-previous"
            onPress={previous}
          />
          <Button
            label="Flip"
            variant="primary"
            testID="deck-flip"
            style={styles.grow}
            onPress={flip}
          />
          <Button label="›" accessibilityLabel="Next card" testID="deck-next" onPress={next} />
        </View>
      )}

      <View style={styles.extras}>
        <Button label="Read aloud" variant="ghost" testID="speak-card" onPress={speak} />
        {sorting ? (
          <Text variant="caption" tone="muted">
            Swipe right for Know, left for Still learning.
          </Text>
        ) : (
          <View style={styles.autoplay}>
            <SwitchRow
              label="Autoplay"
              value={autoplay}
              onValueChange={setAutoplay}
              testID="autoplay"
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.md },
  progress: { gap: spacing.xs },
  controls: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  extras: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  autoplay: { minWidth: 160 },
  summary: { flex: 1, justifyContent: 'center', gap: spacing.md },
});
