import * as fc from 'fast-check';

import {
  formatInterval,
  newSrsCard,
  nextSrsCard,
  previewRatings,
  rateCard,
  srsCounts,
  SRS_RATINGS,
  startOfLocalDay,
  type SrsCard,
  type SrsEntry,
  type SrsRating,
} from './scheduler';

const MINUTE = 60_000;
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 12);

const ratingArbitrary = fc.constantFrom<SrsRating>(...SRS_RATINGS);

/** A card with some review history, plus the time of its next review. */
function reviewed(history: SrsRating[]): { card: SrsCard; now: number } {
  let card = newSrsCard(T0);
  let now = T0;
  for (const rating of history) {
    card = rateCard(card, rating, now);
    now = Math.max(now, card.due);
  }
  return { card, now };
}

describe('rating a new card', () => {
  it('a new card is due immediately', () => {
    expect(newSrsCard(T0).due).toBe(T0);
    expect(newSrsCard(T0).reps).toBe(0);
  });

  it('brings a forgotten card back within minutes', () => {
    const due = rateCard(newSrsCard(T0), 'again', T0).due;
    expect(due - T0).toBeGreaterThan(0);
    expect(due - T0).toBeLessThanOrEqual(10 * MINUTE);
  });

  it('sends an easily remembered card away for days', () => {
    const due = rateCard(newSrsCard(T0), 'easy', T0).due;
    expect(due - T0).toBeGreaterThanOrEqual(DAY);
  });

  it('records the review', () => {
    const card = rateCard(newSrsCard(T0), 'good', T0);
    expect(card.reps).toBe(1);
    expect(card.lastReview).toBe(T0);
  });

  it('counts a lapse when a learned card is forgotten', () => {
    const { card, now } = reviewed(['easy', 'good']);
    expect(rateCard(card, 'again', now).lapses).toBe(card.lapses + 1);
  });
});

describe('invariants', () => {
  it('next due is ordered Again ≤ Hard ≤ Good ≤ Easy', () => {
    fc.assert(
      fc.property(fc.array(ratingArbitrary, { maxLength: 12 }), (history) => {
        const { card, now } = reviewed(history);
        const preview = previewRatings(card, now);
        expect(preview.again).toBeLessThanOrEqual(preview.hard);
        expect(preview.hard).toBeLessThanOrEqual(preview.good);
        expect(preview.good).toBeLessThanOrEqual(preview.easy);
      }),
    );
  });

  it('the preview matches what rating actually does', () => {
    fc.assert(
      fc.property(fc.array(ratingArbitrary, { maxLength: 8 }), ratingArbitrary, (history, next) => {
        const { card, now } = reviewed(history);
        expect(previewRatings(card, now)[next]).toBe(rateCard(card, next, now).due);
      }),
    );
  });

  it('a reviewed card is never due in the past', () => {
    fc.assert(
      fc.property(fc.array(ratingArbitrary, { minLength: 1, maxLength: 12 }), (history) => {
        let card = newSrsCard(T0);
        let now = T0;
        for (const rating of history) {
          card = rateCard(card, rating, now);
          expect(card.due).toBeGreaterThan(now);
          now = card.due;
        }
      }),
    );
  });

  it('survives a JSON round trip', () => {
    const { card } = reviewed(['good', 'again', 'hard', 'easy']);
    expect(JSON.parse(JSON.stringify(card))).toEqual(card);
  });
});

describe('nextSrsCard', () => {
  const due = (cardId: string, at: number): SrsEntry => ({
    cardId,
    srs: { ...newSrsCard(T0), due: at },
  });
  const unseen = (cardId: string): SrsEntry => ({ cardId, srs: null });

  it('offers the earliest due card first', () => {
    const entries = [due('a', T0 - 1000), due('b', T0 - 5000), unseen('c')];
    expect(nextSrsCard(entries, T0, 10)).toEqual({ cardId: 'b', isNew: false });
  });

  it('offers a new card when no review is due and the allowance allows', () => {
    const entries = [due('a', T0 + DAY), unseen('b'), unseen('c')];
    expect(nextSrsCard(entries, T0, 1)).toEqual({ cardId: 'b', isNew: true });
  });

  it('offers nothing when the allowance is used up and nothing is due', () => {
    const entries = [due('a', T0 + DAY), unseen('b')];
    expect(nextSrsCard(entries, T0, 0)).toBeNull();
  });

  it('never offers a card before it is due, and respects the allowance', () => {
    const entryArbitrary = fc.oneof(fc.constant(null), fc.integer({ min: -3 * DAY, max: 3 * DAY }));
    fc.assert(
      fc.property(
        fc.array(entryArbitrary, { maxLength: 20 }),
        fc.integer({ min: 0, max: 5 }),
        (offsets, allowance) => {
          const entries = offsets.map((offset, index) =>
            offset === null ? unseen(`c${index}`) : due(`c${index}`, T0 + offset),
          );
          const next = nextSrsCard(entries, T0, allowance);
          if (next === null) return;

          const entry = entries.find((candidate) => candidate.cardId === next.cardId)!;
          if (next.isNew) {
            expect(entry.srs).toBeNull();
            expect(allowance).toBeGreaterThan(0);
          } else {
            expect(entry.srs!.due).toBeLessThanOrEqual(T0);
          }
        },
      ),
    );
  });

  it('introduces at most the daily allowance of new cards', () => {
    const entries: SrsEntry[] = Array.from({ length: 10 }, (_, i) => unseen(`c${i}`));
    let allowance = 3;
    let introduced = 0;
    // Simulate a day: each new card shown is rated "easy" and uses allowance.
    for (;;) {
      const next = nextSrsCard(entries, T0, allowance);
      if (next === null) break;
      const index = entries.findIndex((entry) => entry.cardId === next.cardId);
      entries[index] = { cardId: next.cardId, srs: rateCard(newSrsCard(T0), 'easy', T0) };
      if (next.isNew) {
        introduced++;
        allowance--;
      }
    }
    expect(introduced).toBe(3);
  });
});

describe('srsCounts', () => {
  it('counts due, new within the allowance, and later cards', () => {
    const entries: SrsEntry[] = [
      { cardId: 'a', srs: { ...newSrsCard(T0), due: T0 - 1 } },
      { cardId: 'b', srs: { ...newSrsCard(T0), due: T0 + 5 * MINUTE } },
      { cardId: 'c', srs: { ...newSrsCard(T0), due: T0 + DAY } },
      { cardId: 'd', srs: null },
      { cardId: 'e', srs: null },
      { cardId: 'f', srs: null },
    ];
    expect(srsCounts(entries, T0, 2)).toEqual({
      due: 1,
      fresh: 2,
      later: 2,
      nextDueAt: T0 + 5 * MINUTE,
    });
  });
});

describe('startOfLocalDay', () => {
  it('is midnight UTC for a zero offset', () => {
    expect(startOfLocalDay(Date.UTC(2026, 4, 3, 15, 30), 0)).toBe(Date.UTC(2026, 4, 3));
  });

  it('follows the local day for a UTC-6 clock', () => {
    // 03:00 UTC on the 3rd is still the 2nd at UTC-6; local midnight is 06:00 UTC.
    expect(startOfLocalDay(Date.UTC(2026, 4, 3, 3), 360)).toBe(Date.UTC(2026, 4, 2, 6));
  });
});

describe('formatInterval', () => {
  it.each([
    [30_000, '<1m'],
    [10 * MINUTE, '10m'],
    [3 * 60 * MINUTE, '3h'],
    [DAY, '1d'],
    [4 * DAY, '4d'],
    [75 * DAY, '2.5mo'],
    [730 * DAY, '2y'],
  ])('%i ms is %s', (ms, label) => {
    expect(formatInterval(ms)).toBe(label);
  });
});
