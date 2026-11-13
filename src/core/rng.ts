/**
 * Seeded pseudo-random number generator.
 *
 * Every study engine takes an Rng instead of calling Math.random(), so a
 * session, a shuffle, or a generated test can be replayed exactly from a seed.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Returns a new array with the items in random order. Does not mutate. */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: small, fast, and good enough for shuffling study material. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int() needs a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = items.slice();
    // Fisher-Yates
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  return { next, int, shuffle };
}
