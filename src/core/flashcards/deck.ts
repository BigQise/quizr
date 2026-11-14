import type { Side } from '../model';
import { createRng } from '../rng';

/**
 * Flashcards as a reducer.
 *
 * browse: flip, go forward and back.
 * sort:   after each card, put it on the "know" or "still learning" pile.
 *
 * A round is finished when index === order.length.
 */
export type DeckMethod = 'browse' | 'sort';
export type Pile = 'know' | 'stillLearning';

export type DeckState = {
  version: 1;
  method: DeckMethod;
  frontSide: Side;
  shuffled: boolean;
  /** Card ids in the order they are shown this round. */
  order: string[];
  index: number;
  flipped: boolean;
  know: string[];
  stillLearning: string[];
  round: number;
};

export type DeckOptions = {
  method: DeckMethod;
  frontSide: Side;
  shuffle: boolean;
};

export type DeckEvent =
  | { type: 'flip' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'sort'; pile: Pile }
  | { type: 'undo' }
  | { type: 'setFrontSide'; side: Side }
  | { type: 'restart'; cardIds: string[]; options: DeckOptions; seed: number }
  | { type: 'reviewStillLearning'; seed: number };

function arrange(cardIds: readonly string[], shuffle: boolean, seed: number): string[] {
  return shuffle ? createRng(seed).shuffle(cardIds) : cardIds.slice();
}

export function createDeck(
  cardIds: readonly string[],
  options: DeckOptions,
  seed: number,
): DeckState {
  return {
    version: 1,
    method: options.method,
    frontSide: options.frontSide,
    shuffled: options.shuffle,
    order: arrange(cardIds, options.shuffle, seed),
    index: 0,
    flipped: false,
    know: [],
    stillLearning: [],
    round: 1,
  };
}

export function isRoundFinished(state: DeckState): boolean {
  return state.index >= state.order.length;
}

export function currentCardId(state: DeckState): string | null {
  return state.order[state.index] ?? null;
}

export function deckReducer(state: DeckState, event: DeckEvent): DeckState {
  switch (event.type) {
    case 'flip':
      return isRoundFinished(state) ? state : { ...state, flipped: !state.flipped };

    case 'next':
      if (state.method !== 'browse' || isRoundFinished(state)) return state;
      return { ...state, index: state.index + 1, flipped: false };

    case 'previous':
      if (state.method !== 'browse' || state.index === 0) return state;
      return { ...state, index: state.index - 1, flipped: false };

    case 'sort': {
      const cardId = currentCardId(state);
      if (state.method !== 'sort' || cardId === null) return state;
      return {
        ...state,
        [event.pile]: [...state[event.pile], cardId],
        index: state.index + 1,
        flipped: false,
      };
    }

    case 'undo': {
      if (state.method !== 'sort' || state.index === 0) return state;
      const cardId = state.order[state.index - 1];
      return {
        ...state,
        know: state.know.filter((id) => id !== cardId),
        stillLearning: state.stillLearning.filter((id) => id !== cardId),
        index: state.index - 1,
        flipped: false,
      };
    }

    case 'setFrontSide':
      return { ...state, frontSide: event.side, flipped: false };

    case 'restart':
      return createDeck(event.cardIds, event.options, event.seed);

    case 'reviewStillLearning':
      if (state.stillLearning.length === 0) return state;
      return {
        ...state,
        order: arrange(state.stillLearning, state.shuffled, event.seed),
        index: 0,
        flipped: false,
        know: [],
        stillLearning: [],
        round: state.round + 1,
      };
  }
}

/** True when a value read back from storage is a usable deck for these cards. */
export function isValidDeckState(value: unknown, cardIds: readonly string[]): value is DeckState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<DeckState>;
  if (state.version !== 1) return false;
  if (state.method !== 'browse' && state.method !== 'sort') return false;
  if (state.frontSide !== 'term' && state.frontSide !== 'definition') return false;
  if (!Array.isArray(state.order) || !Array.isArray(state.know)) return false;
  if (!Array.isArray(state.stillLearning)) return false;
  if (typeof state.index !== 'number' || state.index < 0 || state.index > state.order.length) {
    return false;
  }
  const known = new Set(cardIds);
  return state.order.every((id) => typeof id === 'string' && known.has(id));
}
