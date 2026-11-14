import * as fc from 'fast-check';

import {
  createDeck,
  currentCardId,
  deckReducer,
  isRoundFinished,
  isValidDeckState,
  type DeckEvent,
  type DeckOptions,
  type DeckState,
} from './deck';

const ids = ['a', 'b', 'c', 'd'];
const browse: DeckOptions = { method: 'browse', frontSide: 'term', shuffle: false };
const sort: DeckOptions = { method: 'sort', frontSide: 'term', shuffle: false };

function run(state: DeckState, events: DeckEvent[]): DeckState {
  return events.reduce(deckReducer, state);
}

describe('browse', () => {
  it('starts on the first card, front side up', () => {
    const deck = createDeck(ids, browse, 1);
    expect(currentCardId(deck)).toBe('a');
    expect(deck.flipped).toBe(false);
  });

  it('flips, and shows the front again on the next card', () => {
    const deck = run(createDeck(ids, browse, 1), [{ type: 'flip' }]);
    expect(deck.flipped).toBe(true);
    expect(run(deck, [{ type: 'next' }]).flipped).toBe(false);
  });

  it('goes forward and back and stops at the first card', () => {
    const deck = run(createDeck(ids, browse, 1), [
      { type: 'next' },
      { type: 'next' },
      { type: 'previous' },
    ]);
    expect(currentCardId(deck)).toBe('b');
    expect(currentCardId(run(deck, [{ type: 'previous' }, { type: 'previous' }]))).toBe('a');
  });

  it('finishes the round after the last card', () => {
    const deck = run(
      createDeck(ids, browse, 1),
      ids.map(() => ({ type: 'next' }) as const),
    );
    expect(isRoundFinished(deck)).toBe(true);
    expect(currentCardId(deck)).toBeNull();
    expect(run(deck, [{ type: 'next' }]).index).toBe(ids.length);
  });

  it('shuffles deterministically for a seed', () => {
    const options = { ...browse, shuffle: true };
    const many = Array.from({ length: 30 }, (_, i) => `id${i}`);
    expect(createDeck(many, options, 7).order).toEqual(createDeck(many, options, 7).order);
    expect(createDeck(many, options, 7).order).not.toEqual(many);
    expect(createDeck(many, options, 7).order.slice().sort()).toEqual(many.slice().sort());
  });

  it('ignores sorting events', () => {
    const deck = createDeck(ids, browse, 1);
    expect(run(deck, [{ type: 'sort', pile: 'know' }])).toEqual(deck);
  });
});

describe('sort', () => {
  it('puts cards on piles and reports the round finished', () => {
    const deck = run(createDeck(ids, sort, 1), [
      { type: 'sort', pile: 'know' },
      { type: 'sort', pile: 'stillLearning' },
      { type: 'sort', pile: 'know' },
      { type: 'sort', pile: 'stillLearning' },
    ]);
    expect(deck.know).toEqual(['a', 'c']);
    expect(deck.stillLearning).toEqual(['b', 'd']);
    expect(isRoundFinished(deck)).toBe(true);
  });

  it('undo takes back the last sort', () => {
    const deck = run(createDeck(ids, sort, 1), [
      { type: 'sort', pile: 'know' },
      { type: 'sort', pile: 'stillLearning' },
      { type: 'undo' },
    ]);
    expect(deck.stillLearning).toEqual([]);
    expect(deck.know).toEqual(['a']);
    expect(currentCardId(deck)).toBe('b');
  });

  it('reviews only the still-learning cards in a new round', () => {
    const finished = run(createDeck(ids, sort, 1), [
      { type: 'sort', pile: 'know' },
      { type: 'sort', pile: 'stillLearning' },
      { type: 'sort', pile: 'know' },
      { type: 'sort', pile: 'stillLearning' },
    ]);
    const next = run(finished, [{ type: 'reviewStillLearning', seed: 2 }]);
    expect(next.order).toEqual(['b', 'd']);
    expect(next.round).toBe(2);
    expect(next.know).toEqual([]);
    expect(next.index).toBe(0);
  });

  it('keeps the piles a partition of the cards seen so far', () => {
    const event = fc.oneof(
      fc.constant<DeckEvent>({ type: 'flip' }),
      fc.constant<DeckEvent>({ type: 'sort', pile: 'know' }),
      fc.constant<DeckEvent>({ type: 'sort', pile: 'stillLearning' }),
      fc.constant<DeckEvent>({ type: 'undo' }),
      fc.constant<DeckEvent>({ type: 'next' }),
      fc.constant<DeckEvent>({ type: 'previous' }),
    );
    fc.assert(
      fc.property(fc.array(event, { maxLength: 40 }), fc.integer(), (events, seed) => {
        const deck = run(createDeck(ids, { ...sort, shuffle: true }, seed), events);
        const seen = deck.order.slice(0, deck.index);
        expect([...deck.know, ...deck.stillLearning].sort()).toEqual(seen.slice().sort());
        expect(deck.index).toBeGreaterThanOrEqual(0);
        expect(deck.index).toBeLessThanOrEqual(deck.order.length);
      }),
    );
  });
});

describe('restart and options', () => {
  it('restarts with new options', () => {
    const deck = run(createDeck(ids, browse, 1), [
      { type: 'next' },
      { type: 'restart', cardIds: ['a', 'b'], options: sort, seed: 3 },
    ]);
    expect(deck.method).toBe('sort');
    expect(deck.order).toEqual(['a', 'b']);
    expect(deck.index).toBe(0);
  });

  it('changing the front side shows the front again', () => {
    const deck = run(createDeck(ids, browse, 1), [
      { type: 'flip' },
      { type: 'setFrontSide', side: 'definition' },
    ]);
    expect(deck.frontSide).toBe('definition');
    expect(deck.flipped).toBe(false);
  });
});

describe('isValidDeckState', () => {
  it('accepts a state that survives a JSON round trip', () => {
    const deck = run(createDeck(ids, sort, 1), [{ type: 'sort', pile: 'know' }]);
    const restored: unknown = JSON.parse(JSON.stringify(deck));
    expect(restored).toEqual(deck);
    expect(isValidDeckState(restored, ids)).toBe(true);
  });

  it('rejects junk and decks that mention deleted cards', () => {
    expect(isValidDeckState(null, ids)).toBe(false);
    expect(isValidDeckState({ version: 2 }, ids)).toBe(false);
    expect(isValidDeckState(createDeck(ids, browse, 1), ['a', 'b'])).toBe(false);
  });
});
