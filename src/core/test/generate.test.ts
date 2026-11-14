import * as fc from 'fast-check';

import { cardsArbitrary, makeCards } from '../testing';
import {
  allocate,
  answerKey,
  countUnanswered,
  DEFAULT_TEST_CONFIG,
  generateTest,
  gradeTest,
  matchingBlocks,
  testSize,
  type TestConfig,
  type TestItem,
} from './generate';

const config: TestConfig = { ...DEFAULT_TEST_CONFIG, count: 20 };

function cardIdsOf(items: TestItem[]): string[] {
  return items.flatMap((item) =>
    item.type === 'matching' ? item.pairs.map((pair) => pair.cardId) : [item.cardId],
  );
}

const configArbitrary = fc.record({
  count: fc.integer({ min: 0, max: 60 }),
  trueFalse: fc.boolean(),
  multipleChoice: fc.boolean(),
  matching: fc.boolean(),
  written: fc.boolean(),
  answerWith: fc.constantFrom('term' as const, 'definition' as const),
  grading: fc.constantFrom('strict' as const, 'lenient' as const),
});

describe('allocate', () => {
  it('splits evenly and gives the remainder to the first types', () => {
    expect(allocate(10, config)).toEqual({
      trueFalse: 3,
      multipleChoice: 3,
      matching: 2,
      written: 2,
    });
  });

  it('uses only the enabled types', () => {
    expect(allocate(7, { ...config, trueFalse: false, matching: false })).toEqual({
      trueFalse: 0,
      multipleChoice: 4,
      matching: 0,
      written: 3,
    });
  });

  it('falls back to written when nothing is enabled', () => {
    const none = {
      ...config,
      trueFalse: false,
      multipleChoice: false,
      matching: false,
      written: false,
    };
    expect(allocate(5, none).written).toBe(5);
  });

  it('does not leave a single matching pair when another type can take it', () => {
    expect(allocate(3, config).matching).toBe(0);
  });
});

describe('matchingBlocks', () => {
  it.each([
    [0, []],
    [1, [1]],
    [6, [6]],
    [7, [5, 2]],
    [12, [6, 6]],
    [13, [6, 5, 2]],
  ])('%i pairs → %j', (pairs, expected) => {
    expect(matchingBlocks(pairs)).toEqual(expected);
  });
});

describe('generateTest', () => {
  it('orders the sections true/false, multiple choice, matching, written', () => {
    const test = generateTest(makeCards(30), config, 1);
    const types = test.items.map((item) => item.type);
    expect(types).toEqual([...types].sort((a, b) => order(a) - order(b)));

    function order(type: TestItem['type']) {
      return ['trueFalse', 'multipleChoice', 'matching', 'written'].indexOf(type);
    }
  });

  it('caps the count at the number of cards', () => {
    const test = generateTest(makeCards(5), { ...config, count: 50 }, 1);
    expect(testSize(test)).toBe(5);
    expect(test.config.count).toBe(5);
  });

  it('covers exactly the requested number of cards and never repeats one', () => {
    fc.assert(
      fc.property(cardsArbitrary(0, 40), configArbitrary, fc.integer(), (cards, cfg, seed) => {
        const test = generateTest(cards, cfg, seed);
        const used = cardIdsOf(test.items);
        expect(used).toHaveLength(Math.min(cfg.count, cards.length));
        expect(new Set(used).size).toBe(used.length);
        expect(testSize(test)).toBe(used.length);
      }),
    );
  });

  it('gives the same test for the same seed and config', () => {
    fc.assert(
      fc.property(cardsArbitrary(0, 30), configArbitrary, fc.integer(), (cards, cfg, seed) => {
        expect(generateTest(cards, cfg, seed)).toEqual(generateTest(cards, cfg, seed));
      }),
    );
  });

  it('gives a different test for a different seed', () => {
    const cards = makeCards(40);
    expect(generateTest(cards, config, 1)).not.toEqual(generateTest(cards, config, 2));
  });

  it('only uses question types that are enabled', () => {
    const test = generateTest(makeCards(30), { ...config, trueFalse: false, matching: false }, 3);
    expect(new Set(test.items.map((item) => item.type))).toEqual(
      new Set(['multipleChoice', 'written']),
    );
  });

  it('builds a 100-question test from 5,000 cards within budget', () => {
    const cards = makeCards(5000);
    const start = performance.now();
    generateTest(cards, { ...config, count: 100 }, 1);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('gradeTest', () => {
  it('scores 100% when answered from the answer key', () => {
    fc.assert(
      fc.property(cardsArbitrary(1, 40), configArbitrary, fc.integer(), (cards, cfg, seed) => {
        const test = generateTest(cards, cfg, seed);
        const result = gradeTest(test, answerKey(test));
        expect(result.earned).toBe(result.possible);
        expect(result.possible).toBe(testSize(test));
        expect(result.missedCardIds).toEqual([]);
        if (result.possible > 0) expect(result.percent).toBe(100);
      }),
    );
  });

  it('scores 0 and lists every card when nothing is answered', () => {
    const test = generateTest(makeCards(20), config, 1);
    const result = gradeTest(test, []);
    expect(result.earned).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.missedCardIds.sort()).toEqual(cardIdsOf(test.items).sort());
    expect(countUnanswered(test, [])).toBe(20);
  });

  it('gives partial credit inside a matching block', () => {
    const test = generateTest(
      makeCards(4),
      { ...config, count: 4, trueFalse: false, multipleChoice: false, written: false },
      1,
    );
    const [block] = test.items;
    if (block.type !== 'matching') throw new Error('expected a matching block');

    const key = answerKey(test)[0] as number[];
    const answers = [[key[0], key[1], null, null]];
    const result = gradeTest(test, answers);

    expect(result.earned).toBe(2);
    expect(result.possible).toBe(4);
    expect(result.percent).toBe(50);
    expect(result.byType.matching).toEqual({ earned: 2, possible: 4 });
    expect(result.missedCardIds).toEqual([block.pairs[2].cardId, block.pairs[3].cardId]);
    expect(countUnanswered(test, answers)).toBe(2);
  });

  it('reports what was given and expected for each card', () => {
    const test = generateTest(
      makeCards(3),
      { ...config, count: 3, trueFalse: false, multipleChoice: false, matching: false },
      1,
    );
    const first = test.items[0];
    if (first.type !== 'written') throw new Error('expected a written question');

    const result = gradeTest(test, ['nonsense']);
    expect(result.items[0].cards[0]).toEqual({
      cardId: first.cardId,
      prompt: first.prompt,
      expected: first.answer,
      given: 'nonsense',
      correct: false,
    });
  });

  it('treats a blank written answer as unanswered and wrong', () => {
    const test = generateTest(
      makeCards(2),
      { ...config, count: 2, trueFalse: false, multipleChoice: false, matching: false },
      1,
    );
    expect(countUnanswered(test, ['  ', 'x'])).toBe(1);
    expect(gradeTest(test, ['  ', '']).earned).toBe(0);
  });
});
