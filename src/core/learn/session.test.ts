import * as fc from 'fast-check';

import type { StudyCard } from '../model';
import { cardsArbitrary, makeCards } from '../testing';
import {
  correctAnswerFor,
  createLearnSession,
  DEFAULT_LEARN_CONFIG,
  isValidLearnState,
  learnProgress,
  learnReducer,
  type LearnAnswer,
  type LearnConfig,
  type LearnState,
} from './session';

const config: LearnConfig = { ...DEFAULT_LEARN_CONFIG, roundSize: 3 };
const wrong: LearnAnswer = { kind: 'dontKnow' };

function answerCorrectly(state: LearnState, cards: readonly StudyCard[]): LearnState {
  return learnReducer(state, { type: 'answer', answer: correctAnswerFor(state.question!) }, cards);
}

/** Moves on from feedback or a checkpoint to the next question, or to the end. */
function advance(state: LearnState, cards: readonly StudyCard[]): LearnState {
  let next = state;
  if (next.phase === 'feedback') next = learnReducer(next, { type: 'continue' }, cards);
  if (next.phase === 'checkpoint') next = learnReducer(next, { type: 'nextRound' }, cards);
  return next;
}

/** Answers everything correctly until the session ends. Returns questions asked. */
function finishAllCorrect(start: LearnState, cards: readonly StudyCard[]) {
  let state = start;
  let questions = 0;
  while (state.phase !== 'finished') {
    expect(state.phase).toBe('question');
    state = advance(answerCorrectly(state, cards), cards);
    questions++;
    if (questions > cards.length * 10 + 10) throw new Error('session did not terminate');
  }
  return { state, questions };
}

describe('starting', () => {
  it('begins a round with a question on the first card', () => {
    const cards = makeCards(5);
    const state = createLearnSession(cards, config, 1);

    expect(state.phase).toBe('question');
    expect(state.roundNumber).toBe(1);
    expect(state.queue).toEqual(['c0', 'c1', 'c2']);
    expect(state.question!.cardId).toBe('c0');
    expect(learnProgress(state)).toEqual({ fresh: 5, familiar: 0, mastered: 0, total: 5 });
  });

  it('is finished straight away when there is nothing to learn', () => {
    expect(createLearnSession([], config, 1).phase).toBe('finished');
    const cards = makeCards(2);
    expect(createLearnSession(cards, config, 1, { c0: 2, c1: 2 }).phase).toBe('finished');
  });

  it('asks a recognition question for a new card and a written one for a familiar card', () => {
    const cards = makeCards(5);
    expect(createLearnSession(cards, config, 1).question!.type).not.toBe('written');
    expect(createLearnSession(cards, config, 1, { c0: 1 }).question!.type).toBe('written');
  });

  it('puts familiar cards before new ones in a round', () => {
    const cards = makeCards(5);
    const state = createLearnSession(cards, config, 1, { c3: 1 });
    expect(state.queue).toEqual(['c3', 'c0', 'c1']);
  });
});

describe('question types follow the options', () => {
  const cards = makeCards(6);

  it('uses only written questions when recognition types are off', () => {
    const state = createLearnSession(
      cards,
      { ...config, multipleChoice: false, trueFalse: false },
      1,
    );
    expect(state.question!.type).toBe('written');
  });

  it('never asks a written question when written is off', () => {
    const { state } = finishAllCorrect(
      createLearnSession(cards, { ...config, written: false }, 4),
      cards,
    );
    expect(state.phase).toBe('finished');
    let probe = createLearnSession(cards, { ...config, written: false }, 4, { c0: 1 });
    for (let i = 0; i < 12 && probe.phase === 'question'; i++) {
      expect(probe.question!.type).not.toBe('written');
      probe = advance(answerCorrectly(probe, cards), cards);
    }
  });

  it('uses only true/false when it is the only recognition type', () => {
    const state = createLearnSession(cards, { ...config, multipleChoice: false }, 1);
    expect(state.question!.type).toBe('trueFalse');
  });

  it('asks for the term when answering with terms', () => {
    const state = createLearnSession(cards, { ...config, answerWith: 'term' }, 1);
    expect(state.question!.prompt).toBe(cards[0].definition);
    expect(state.question!.answer).toBe(cards[0].term);
  });
});

describe('answering', () => {
  const cards = makeCards(5);

  it('a right answer raises the stage and clears the card from the round', () => {
    const state = answerCorrectly(createLearnSession(cards, config, 1), cards);

    expect(state.phase).toBe('feedback');
    expect(state.feedback).toMatchObject({ cardId: 'c0', correct: true });
    expect(state.stages.c0).toBe(1);
    expect(state.queue).toEqual(['c1', 'c2']);
    expect(state.cleared).toEqual(['c0']);
  });

  it('a wrong answer keeps a new card at stage 0 and brings it back two questions later', () => {
    const state = learnReducer(
      createLearnSession(cards, config, 1),
      { type: 'answer', answer: wrong },
      cards,
    );

    expect(state.feedback).toMatchObject({ cardId: 'c0', correct: false, given: '' });
    expect(state.stages.c0).toBe(0);
    expect(state.queue).toEqual(['c1', 'c2', 'c0']);
  });

  it('a wrong answer drops a familiar card back to new', () => {
    const start = createLearnSession(cards, config, 1, { c0: 1 });
    const state = learnReducer(start, { type: 'answer', answer: wrong }, cards);
    expect(state.stages.c0).toBe(0);
  });

  it('grades written answers with the configured strictness', () => {
    const start = createLearnSession(cards, { ...config, grading: 'strict' }, 1, { c0: 1 });
    const typo = `${cards[0].definition}x`;
    const strict = learnReducer(
      start,
      { type: 'answer', answer: { kind: 'text', text: typo } },
      cards,
    );
    expect(strict.feedback!.correct).toBe(false);
    expect(strict.feedback!.given).toBe(typo);

    const lenientStart = createLearnSession(cards, { ...config, grading: 'lenient' }, 1, { c0: 1 });
    const lenient = learnReducer(
      lenientStart,
      { type: 'answer', answer: { kind: 'text', text: typo } },
      cards,
    );
    expect(lenient.feedback!.correct).toBe(true);
  });

  it('ignores events that do not fit the phase', () => {
    const question = createLearnSession(cards, config, 1);
    expect(learnReducer(question, { type: 'continue' }, cards)).toBe(question);
    expect(learnReducer(question, { type: 'override' }, cards)).toBe(question);
    expect(learnReducer(question, { type: 'nextRound' }, cards)).toBe(question);

    const feedback = answerCorrectly(question, cards);
    expect(learnReducer(feedback, { type: 'answer', answer: wrong }, cards)).toBe(feedback);
  });
});

describe('"I was correct"', () => {
  const cards = makeCards(5);

  it('turns a miss into the same result as a right answer', () => {
    const start = createLearnSession(cards, config, 1);
    const missed = learnReducer(start, { type: 'answer', answer: wrong }, cards);
    const overridden = learnReducer(missed, { type: 'override' }, cards);
    const right = answerCorrectly(start, cards);

    expect(overridden.stages).toEqual(right.stages);
    expect(overridden.queue).toEqual(right.queue);
    expect(overridden.cleared).toEqual(right.cleared);
    expect(overridden.streak).toBe(right.streak);
    expect(overridden.correctCount).toBe(right.correctCount);
    expect(overridden.feedback).toMatchObject({ correct: true, overridden: true });
  });

  it('cannot be used twice or on a right answer', () => {
    const start = createLearnSession(cards, config, 1);
    const overridden = learnReducer(
      learnReducer(start, { type: 'answer', answer: wrong }, cards),
      { type: 'override' },
      cards,
    );
    expect(learnReducer(overridden, { type: 'override' }, cards)).toBe(overridden);

    const right = answerCorrectly(start, cards);
    expect(learnReducer(right, { type: 'override' }, cards)).toBe(right);
  });
});

describe('streak', () => {
  const cards = makeCards(8);

  it('counts first-try right answers in a row and resets on a miss', () => {
    let state = createLearnSession(cards, { ...config, roundSize: 8 }, 1);
    for (let i = 0; i < 5; i++) state = advance(answerCorrectly(state, cards), cards);
    expect(state.streak).toBe(5);

    state = learnReducer(state, { type: 'answer', answer: wrong }, cards);
    expect(state.streak).toBe(0);
  });

  it('keeps the streak when a miss is overridden', () => {
    let state = createLearnSession(cards, { ...config, roundSize: 8 }, 1);
    for (let i = 0; i < 3; i++) state = advance(answerCorrectly(state, cards), cards);
    state = learnReducer(state, { type: 'answer', answer: wrong }, cards);
    state = learnReducer(state, { type: 'override' }, cards);
    expect(state.streak).toBe(4);
  });

  it('does not count a right answer on a retry', () => {
    let state = createLearnSession(cards.slice(0, 1), config, 1);
    state = advance(learnReducer(state, { type: 'answer', answer: wrong }, cards), cards);
    state = answerCorrectly(state, cards);
    expect(state.streak).toBe(0);
  });
});

describe('rounds', () => {
  const cards = makeCards(5);

  it('reaches a checkpoint when every card in the round is cleared', () => {
    let state = createLearnSession(cards, config, 1);
    for (let i = 0; i < 2; i++) state = advance(answerCorrectly(state, cards), cards);
    state = learnReducer(answerCorrectly(state, cards), { type: 'continue' }, cards);

    expect(state.phase).toBe('checkpoint');
    expect(learnProgress(state)).toEqual({ fresh: 2, familiar: 3, mastered: 0, total: 5 });

    const next = learnReducer(state, { type: 'nextRound' }, cards);
    expect(next.phase).toBe('question');
    expect(next.roundNumber).toBe(2);
    expect(next.queue).toEqual(['c0', 'c1', 'c2']);
    expect(next.question!.type).toBe('written');
  });

  it('finishes when every card is mastered', () => {
    const { state } = finishAllCorrect(createLearnSession(cards, config, 1), cards);
    expect(learnProgress(state)).toEqual({ fresh: 0, familiar: 0, mastered: 5, total: 5 });
    expect(state.question).toBeNull();
  });
});

describe('invariants', () => {
  it('with all-correct answers, N cards finish in exactly 2N questions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 25 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer(),
        (count, roundSize, seed) => {
          const cards = makeCards(count);
          const start = createLearnSession(cards, { ...config, roundSize }, seed);
          expect(finishAllCorrect(start, cards).questions).toBe(count * 2);
        },
      ),
    );
  });

  it('holds its rules for any sequence of right and wrong answers', () => {
    fc.assert(
      fc.property(
        cardsArbitrary(1, 12),
        fc.array(fc.boolean(), { maxLength: 80 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer(),
        (cards, outcomes, roundSize, seed) => {
          let state = createLearnSession(cards, { ...config, roundSize }, seed);

          for (const right of outcomes) {
            if (state.phase === 'finished') break;
            expect(state.phase).toBe('question');
            expect(state.question).not.toBeNull();

            const cardId = state.question!.cardId;
            const stageBefore = state.stages[cardId];
            const othersLeft = state.queue.length - 1;

            const answered = learnReducer(
              state,
              { type: 'answer', answer: right ? correctAnswerFor(state.question!) : wrong },
              cards,
            );

            // A stage moves by at most one and stays in range.
            const stageAfter = answered.stages[cardId];
            expect(Math.abs(stageAfter - stageBefore)).toBeLessThanOrEqual(1);
            expect(stageAfter).toBeGreaterThanOrEqual(0);
            expect(stageAfter).toBeLessThanOrEqual(2);

            if (!right) {
              // A missed card comes back this round, and not straight away
              // when other cards are waiting.
              expect(answered.queue).toContain(cardId);
              if (othersLeft > 0) expect(answered.queue[0]).not.toBe(cardId);
            }

            // Saved and restored, the session is identical.
            expect(JSON.parse(JSON.stringify(answered))).toEqual(answered);

            state = advance(answered, cards);
            // Never stuck: either finished or showing a question.
            expect(['question', 'finished']).toContain(state.phase);
            if (state.phase === 'question') expect(state.question).not.toBeNull();
          }
        },
      ),
    );
  });

  it('asks the next question within the time budget on a 5,000-card set', () => {
    const cards = makeCards(5000);
    let state = createLearnSession(cards, DEFAULT_LEARN_CONFIG, 1);
    const start = performance.now();
    for (let i = 0; i < 20; i++) state = advance(answerCorrectly(state, cards), cards);
    expect((performance.now() - start) / 20).toBeLessThan(50);
  });
});

describe('isValidLearnState', () => {
  const cards = makeCards(4);
  const ids = cards.map((card) => card.id);

  it('accepts a saved session for the same cards', () => {
    const state = answerCorrectly(createLearnSession(cards, config, 1), cards);
    expect(isValidLearnState(JSON.parse(JSON.stringify(state)), ids)).toBe(true);
  });

  it('rejects junk, and sessions for a set whose cards changed', () => {
    const state = createLearnSession(cards, config, 1);
    expect(isValidLearnState(null, ids)).toBe(false);
    expect(isValidLearnState({ version: 1 }, ids)).toBe(false);
    expect(isValidLearnState({ ...state, phase: 'question', question: null }, ids)).toBe(false);
    expect(isValidLearnState(state, ids.slice(0, 3))).toBe(false);
    expect(isValidLearnState(state, [...ids.slice(0, 3), 'other'])).toBe(false);
  });
});
