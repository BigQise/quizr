import * as fc from 'fast-check';

import { createRng } from './rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = createRng(seed);
        const b = createRng(seed);
        for (let i = 0; i < 20; i++) {
          expect(a.next()).toBe(b.next());
        }
      }),
    );
  });

  it('next() stays in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = createRng(seed);
        for (let i = 0; i < 50; i++) {
          const value = rng.next();
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  it('int() stays in [0, max)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 10_000 }), (seed, max) => {
        const value = createRng(seed).int(max);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(max);
      }),
    );
  });

  it('int() rejects a non-positive or fractional bound', () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(-3)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });

  it('shuffle() keeps exactly the same items and does not mutate the input', () => {
    const ascending = (x: number, y: number) => x - y;
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.integer()), (seed, items) => {
        const before = items.slice();
        const shuffled = createRng(seed).shuffle(items);
        expect(items).toEqual(before);
        expect(shuffled.slice().sort(ascending)).toEqual(before.slice().sort(ascending));
      }),
    );
  });

  it('shuffle() is deterministic for a seed', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(createRng(42).shuffle(items)).toEqual(createRng(42).shuffle(items));
    expect(createRng(42).shuffle(items)).not.toEqual(createRng(43).shuffle(items));
  });
});
