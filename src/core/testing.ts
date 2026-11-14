import * as fc from 'fast-check';

import type { StudyCard } from './model';

/** Test helpers for the core engines. Not used by the app. */

export function makeCards(count: number, prefix = ''): StudyCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}c${i}`,
    term: `${prefix}term ${i}`,
    definition: `${prefix}definition number ${i}`,
    starred: false,
  }));
}

const text = fc.string({ minLength: 1, maxLength: 24 }).filter((value) => value.trim() !== '');

/** Sets of cards with unique ids and arbitrary, possibly repeated, text. */
export function cardsArbitrary(minLength: number, maxLength: number): fc.Arbitrary<StudyCard[]> {
  return fc
    .array(fc.record({ term: text, definition: text, starred: fc.boolean() }), {
      minLength,
      maxLength,
    })
    .map((cards) => cards.map((card, index) => ({ ...card, id: `c${index}` })));
}
