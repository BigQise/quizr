import { gradeWritten, normalizeAnswer, type GradingMode } from '../grading';
import { otherSide, textOn, type Side, type StudyCard } from '../model';
import {
  makeMultipleChoice,
  makeTrueFalse,
  makeWritten,
  type MultipleChoiceQuestion,
  type TrueFalseQuestion,
  type WrittenQuestion,
} from '../questions';
import { createRng } from '../rng';

/**
 * Practice tests: generated from a set, answered in one sitting, then graded.
 * Generation is deterministic for a given seed, and no card is used twice.
 * `count` is the number of cards covered; a matching block of five pairs
 * counts as five.
 */
export type TestConfig = {
  count: number;
  trueFalse: boolean;
  multipleChoice: boolean;
  matching: boolean;
  written: boolean;
  answerWith: Side;
  grading: GradingMode;
};

export const DEFAULT_TEST_CONFIG: TestConfig = {
  count: 20,
  trueFalse: true,
  multipleChoice: true,
  matching: true,
  written: true,
  answerWith: 'definition',
  grading: 'lenient',
};

export type MatchingItem = {
  type: 'matching';
  pairs: { cardId: string; prompt: string; answer: string }[];
  /** The pairs' answers, shuffled. */
  options: string[];
};

export type TestItem = TrueFalseQuestion | MultipleChoiceQuestion | MatchingItem | WrittenQuestion;
export type TestItemType = TestItem['type'];

export type GeneratedTest = {
  seed: number;
  config: TestConfig;
  items: TestItem[];
};

/**
 * One answer per item, by position:
 * true/false → boolean, multiple choice → option index, written → text,
 * matching → chosen option index per pair. null or undefined = unanswered.
 */
export type TestAnswer = boolean | number | string | (number | null)[] | null | undefined;

export const MATCHING_BLOCK_SIZE = 6;

const TYPE_ORDER = ['trueFalse', 'multipleChoice', 'matching', 'written'] as const;

/** Splits `count` cards as evenly as possible across the enabled types. */
export function allocate(count: number, config: TestConfig): Record<TestItemType, number> {
  const allocation: Record<TestItemType, number> = {
    trueFalse: 0,
    multipleChoice: 0,
    matching: 0,
    written: 0,
  };
  let enabled = TYPE_ORDER.filter((type) => config[type]);
  if (enabled.length === 0) enabled = ['written'];

  const base = Math.floor(count / enabled.length);
  const remainder = count % enabled.length;
  enabled.forEach((type, index) => {
    allocation[type] = base + (index < remainder ? 1 : 0);
  });

  // A single pair is not a matching question; hand it to another type.
  const fallback = enabled.find((type) => type !== 'matching');
  if (allocation.matching === 1 && fallback) {
    allocation.matching = 0;
    allocation[fallback] += 1;
  }
  return allocation;
}

/** Block sizes of at most MATCHING_BLOCK_SIZE, avoiding a final block of one. */
export function matchingBlocks(pairCount: number): number[] {
  const sizes: number[] = [];
  let remaining = pairCount;
  while (remaining > 0) {
    const size = Math.min(MATCHING_BLOCK_SIZE, remaining);
    sizes.push(size);
    remaining -= size;
  }
  const last = sizes.length - 1;
  if (last > 0 && sizes[last] === 1) {
    sizes[last - 1] -= 1;
    sizes[last] += 1;
  }
  return sizes;
}

export function generateTest(
  cards: readonly StudyCard[],
  config: TestConfig,
  seed: number,
  /** Cards that wrong options may be drawn from. Defaults to the tested cards. */
  pool: readonly StudyCard[] = cards,
): GeneratedTest {
  const rng = createRng(seed);
  const count = Math.max(0, Math.min(Math.floor(config.count), cards.length));
  const chosen = rng.shuffle(cards).slice(0, count);
  const allocation = allocate(count, config);
  const items: TestItem[] = [];
  let cursor = 0;
  const take = (amount: number) => chosen.slice(cursor, (cursor += amount));

  for (const card of take(allocation.trueFalse)) {
    items.push(makeTrueFalse(card, pool, config.answerWith, rng));
  }

  for (const card of take(allocation.multipleChoice)) {
    // A set with no other distinct answer cannot offer choices: ask in writing.
    items.push(
      makeMultipleChoice(card, pool, config.answerWith, rng) ??
        makeWritten(card, config.answerWith),
    );
  }

  const matchingCards = take(allocation.matching);
  let offset = 0;
  for (const size of matchingBlocks(matchingCards.length)) {
    const pairs = matchingCards.slice(offset, offset + size).map((card) => ({
      cardId: card.id,
      prompt: textOn(card, otherSide(config.answerWith)),
      answer: textOn(card, config.answerWith),
    }));
    offset += size;
    items.push({
      type: 'matching',
      pairs,
      options: rng.shuffle(pairs.map((pair) => pair.answer)),
    });
  }

  for (const card of take(allocation.written)) {
    items.push(makeWritten(card, config.answerWith));
  }

  return { seed, config: { ...config, count }, items };
}

export type CardResult = {
  cardId: string;
  prompt: string;
  expected: string;
  /** What the learner answered, as display text. Empty when unanswered. */
  given: string;
  correct: boolean;
};

export type ItemResult = {
  type: TestItemType;
  earned: number;
  possible: number;
  cards: CardResult[];
};

export type TestResult = {
  earned: number;
  possible: number;
  /** 0–100, rounded. */
  percent: number;
  items: ItemResult[];
  byType: Record<TestItemType, { earned: number; possible: number }>;
  missedCardIds: string[];
};

function gradeItem(item: TestItem, answer: TestAnswer, grading: GradingMode): CardResult[] {
  switch (item.type) {
    case 'trueFalse': {
      const answered = typeof answer === 'boolean';
      return [
        {
          cardId: item.cardId,
          prompt: `${item.prompt} → ${item.shownAnswer}`,
          expected: item.isTrue ? 'True' : `False (it is: ${item.answer})`,
          given: answered ? (answer ? 'True' : 'False') : '',
          correct: answered && answer === item.isTrue,
        },
      ];
    }
    case 'multipleChoice': {
      const answered = typeof answer === 'number';
      return [
        {
          cardId: item.cardId,
          prompt: item.prompt,
          expected: item.answer,
          given: answered ? (item.options[answer] ?? '') : '',
          correct: answered && answer === item.correctIndex,
        },
      ];
    }
    case 'written': {
      const text = typeof answer === 'string' ? answer : '';
      return [
        {
          cardId: item.cardId,
          prompt: item.prompt,
          expected: item.answer,
          given: text,
          correct: text.trim() !== '' && gradeWritten(text, item.answer, grading),
        },
      ];
    }
    case 'matching': {
      const choices = Array.isArray(answer) ? answer : [];
      return item.pairs.map((pair, index) => {
        const choice = choices[index];
        const given = typeof choice === 'number' ? (item.options[choice] ?? '') : '';
        return {
          cardId: pair.cardId,
          prompt: pair.prompt,
          expected: pair.answer,
          given,
          // Compared by text, so two pairs with the same answer are both gradable.
          correct: given !== '' && normalizeAnswer(given) === normalizeAnswer(pair.answer),
        };
      });
    }
  }
}

export function gradeTest(test: GeneratedTest, answers: readonly TestAnswer[]): TestResult {
  const byType: TestResult['byType'] = {
    trueFalse: { earned: 0, possible: 0 },
    multipleChoice: { earned: 0, possible: 0 },
    matching: { earned: 0, possible: 0 },
    written: { earned: 0, possible: 0 },
  };
  const missedCardIds: string[] = [];

  const items = test.items.map((item, index): ItemResult => {
    const cards = gradeItem(item, answers[index], test.config.grading);
    const earned = cards.filter((card) => card.correct).length;
    byType[item.type].earned += earned;
    byType[item.type].possible += cards.length;
    for (const card of cards) if (!card.correct) missedCardIds.push(card.cardId);
    return { type: item.type, earned, possible: cards.length, cards };
  });

  const earned = items.reduce((sum, item) => sum + item.earned, 0);
  const possible = items.reduce((sum, item) => sum + item.possible, 0);
  return {
    earned,
    possible,
    percent: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    items,
    byType,
    missedCardIds,
  };
}

/** The answers that score 100%. */
export function answerKey(test: GeneratedTest): TestAnswer[] {
  return test.items.map((item): TestAnswer => {
    switch (item.type) {
      case 'trueFalse':
        return item.isTrue;
      case 'multipleChoice':
        return item.correctIndex;
      case 'written':
        return item.answer;
      case 'matching':
        return item.pairs.map((pair) => item.options.indexOf(pair.answer));
    }
  });
}

/** How many cards' worth of questions have no answer yet. */
export function countUnanswered(test: GeneratedTest, answers: readonly TestAnswer[]): number {
  let unanswered = 0;
  test.items.forEach((item, index) => {
    const answer = answers[index];
    if (item.type === 'matching') {
      const choices = Array.isArray(answer) ? answer : [];
      unanswered += item.pairs.filter((_, pair) => typeof choices[pair] !== 'number').length;
    } else if (item.type === 'written') {
      if (typeof answer !== 'string' || answer.trim() === '') unanswered += 1;
    } else if (answer === null || answer === undefined) {
      unanswered += 1;
    }
  });
  return unanswered;
}

/** Number of cards a test covers. */
export function testSize(test: GeneratedTest): number {
  return test.items.reduce(
    (sum, item) => sum + (item.type === 'matching' ? item.pairs.length : 1),
    0,
  );
}
