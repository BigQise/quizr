import { normalizeAnswer } from './grading';
import { otherSide, textOn, type Side, type StudyCard } from './model';
import type { Rng } from './rng';

/**
 * Questions built from a card. `answerWith` is the side the learner must
 * produce; the other side is shown as the prompt.
 */
export type MultipleChoiceQuestion = {
  type: 'multipleChoice';
  cardId: string;
  prompt: string;
  /** The right answer's text. Always equal to options[correctIndex]. */
  answer: string;
  options: string[];
  correctIndex: number;
};

export type TrueFalseQuestion = {
  type: 'trueFalse';
  cardId: string;
  prompt: string;
  /** The right answer's text, whatever was shown. */
  answer: string;
  /** The answer shown next to the prompt, which may be wrong. */
  shownAnswer: string;
  isTrue: boolean;
};

export type WrittenQuestion = {
  type: 'written';
  cardId: string;
  prompt: string;
  answer: string;
};

export type Question = MultipleChoiceQuestion | TrueFalseQuestion | WrittenQuestion;

export const DISTRACTOR_COUNT = 3;

/** Above this pool size, distractors are drawn from a random sample to stay fast. */
const SAMPLE_THRESHOLD = 200;
const SAMPLE_SIZE = 60;

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length, 1);
  const lengthScore = 1 - Math.abs(a.length - b.length) / longest;
  const wordsOfA = new Set(a.split(' '));
  const sharedWords = b.split(' ').filter((word) => word.length > 2 && wordsOfA.has(word)).length;
  return lengthScore + sharedWords;
}

function candidatePool(card: StudyCard, pool: readonly StudyCard[], rng: Rng): StudyCard[] {
  if (pool.length <= SAMPLE_THRESHOLD) return rng.shuffle(pool);

  const picked = new Set<number>();
  const sample: StudyCard[] = [];
  // Bounded number of draws, so this always terminates.
  for (let draws = 0; draws < SAMPLE_SIZE * 4 && sample.length < SAMPLE_SIZE; draws++) {
    const index = rng.int(pool.length);
    if (picked.has(index) || pool[index].id === card.id) continue;
    picked.add(index);
    sample.push(pool[index]);
  }
  return sample;
}

/**
 * Wrong answers for a multiple-choice question, taken from other cards in the
 * same set. Never equal (ignoring case and punctuation) to the right answer or
 * to each other. `hard` picks the most similar ones; otherwise it picks at
 * random among the more similar ones.
 */
export function pickDistractors(
  card: StudyCard,
  pool: readonly StudyCard[],
  answerWith: Side,
  count: number,
  rng: Rng,
  hard = false,
): string[] {
  const correct = textOn(card, answerWith);
  const correctKey = normalizeAnswer(correct) || correct.trim();
  const seen = new Set<string>([correctKey]);
  const candidates: { text: string; score: number }[] = [];

  for (const other of candidatePool(card, pool, rng)) {
    if (other.id === card.id) continue;
    const text = textOn(other, answerWith);
    const key = normalizeAnswer(text) || text.trim();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    candidates.push({ text, score: similarity(correctKey, key) });
  }

  candidates.sort((a, b) => b.score - a.score);
  const window = hard ? count : count * 3;
  return rng
    .shuffle(candidates.slice(0, window))
    .slice(0, count)
    .map((candidate) => candidate.text);
}

/** Returns null when the set has no other distinct answer to offer. */
export function makeMultipleChoice(
  card: StudyCard,
  pool: readonly StudyCard[],
  answerWith: Side,
  rng: Rng,
  hard = false,
): MultipleChoiceQuestion | null {
  const answer = textOn(card, answerWith);
  const distractors = pickDistractors(card, pool, answerWith, DISTRACTOR_COUNT, rng, hard);
  if (distractors.length === 0) return null;

  const options = rng.shuffle([answer, ...distractors]);
  return {
    type: 'multipleChoice',
    cardId: card.id,
    prompt: textOn(card, otherSide(answerWith)),
    answer,
    options,
    correctIndex: options.indexOf(answer),
  };
}

export function makeTrueFalse(
  card: StudyCard,
  pool: readonly StudyCard[],
  answerWith: Side,
  rng: Rng,
): TrueFalseQuestion {
  const answer = textOn(card, answerWith);
  const wantsFalse = rng.next() < 0.5;
  const [wrong] = wantsFalse ? pickDistractors(card, pool, answerWith, 1, rng) : [];

  return {
    type: 'trueFalse',
    cardId: card.id,
    prompt: textOn(card, otherSide(answerWith)),
    answer,
    shownAnswer: wrong ?? answer,
    isTrue: wrong === undefined,
  };
}

export function makeWritten(card: StudyCard, answerWith: Side): WrittenQuestion {
  return {
    type: 'written',
    cardId: card.id,
    prompt: textOn(card, otherSide(answerWith)),
    answer: textOn(card, answerWith),
  };
}
