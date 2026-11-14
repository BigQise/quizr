import { isValidDeckState, type DeckState } from '@/core/flashcards/deck';
import type { Side } from '@/core/model';

export type StudyMethod = 'browse' | 'sort' | 'srs';

export type FlashcardOptions = {
  method: StudyMethod;
  frontSide: Side;
  shuffle: boolean;
  starredOnly: boolean;
};

export const DEFAULT_FLASHCARD_OPTIONS: FlashcardOptions = {
  method: 'browse',
  frontSide: 'term',
  shuffle: false,
  starredOnly: false,
};

/** What is saved so Flashcards reopens where it was left. */
export type SavedFlashcards = {
  version: 1;
  options: FlashcardOptions;
  deck: DeckState | null;
};

/** Options that, when changed, start a new deck. */
export function deckKey(options: FlashcardOptions): string {
  return `${options.method}|${options.shuffle}|${options.starredOnly}`;
}

export function readSavedOptions(value: unknown): FlashcardOptions {
  if (typeof value !== 'object' || value === null) return DEFAULT_FLASHCARD_OPTIONS;
  const options = (value as Partial<SavedFlashcards>).options;
  if (typeof options !== 'object' || options === null) return DEFAULT_FLASHCARD_OPTIONS;

  const method = (['browse', 'sort', 'srs'] as const).find((m) => m === options.method);
  return {
    method: method ?? 'browse',
    frontSide: options.frontSide === 'definition' ? 'definition' : 'term',
    shuffle: options.shuffle === true,
    starredOnly: options.starredOnly === true,
  };
}

/** The saved deck, if it is still usable for these cards; otherwise null. */
export function readSavedDeck(value: unknown, cardIds: readonly string[]): DeckState | null {
  if (typeof value !== 'object' || value === null) return null;
  const deck = (value as Partial<SavedFlashcards>).deck;
  return isValidDeckState(deck, cardIds) ? deck : null;
}
