import { gradeWritten, type GradingMode } from '../grading';
import type { Side, StudyCard } from '../model';
import { makeMultipleChoice, makeTrueFalse, makeWritten, type Question } from '../questions';
import { createRng } from '../rng';

/**
 * Learn as a reducer.
 *
 * Each card has a stage: 0 New, 1 Familiar, 2 Mastered.
 *   - A right answer raises the stage by one.
 *   - A wrong answer lowers it by one (never below 0) and brings the card back
 *     later in the same round.
 * Stage 0 gets a recognition question (multiple choice or true/false).
 * Stage 1 gets a written question, so mastery needs recall.
 *
 * Cards are studied in rounds of `roundSize`. A round ends when every card in
 * it has been answered correctly once. The session ends when every card is
 * Mastered.
 */
export type Stage = 0 | 1 | 2;

export type LearnConfig = {
  /** The side the learner must produce. */
  answerWith: Side;
  multipleChoice: boolean;
  trueFalse: boolean;
  written: boolean;
  grading: GradingMode;
  roundSize: number;
  /** After a missed written question, require typing the right answer. */
  retypeOnMiss: boolean;
};

export const DEFAULT_LEARN_CONFIG: LearnConfig = {
  answerWith: 'definition',
  multipleChoice: true,
  trueFalse: true,
  written: true,
  grading: 'lenient',
  roundSize: 7,
  retypeOnMiss: false,
};

/** Streak is shown once this many first-try answers in a row are right. */
export const STREAK_THRESHOLD = 5;

export type LearnAnswer =
  | { kind: 'choice'; index: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'text'; text: string }
  | { kind: 'dontKnow' };

type Snapshot = {
  stages: Record<string, Stage>;
  lastSeen: Record<string, number>;
  queue: string[];
  cleared: string[];
  attempts: Record<string, number>;
  streak: number;
  answered: number;
  correctCount: number;
};

export type LearnFeedback = {
  cardId: string;
  correct: boolean;
  /** What the learner answered, as display text. Empty for "Don't know". */
  given: string;
  expected: string;
  prompt: string;
  questionType: Question['type'];
  /** True once "I was correct" has been used on this answer. */
  overridden: boolean;
  /** State just before the answer, so an override can replay it as correct. */
  before: Snapshot;
};

export type LearnPhase = 'question' | 'feedback' | 'checkpoint' | 'finished';

export type LearnState = {
  version: 1;
  config: LearnConfig;
  seed: number;
  /** Counts answers. Also varies the randomness from question to question. */
  step: number;
  /** Every card in scope, in set order. */
  cardIds: string[];
  stages: Record<string, Stage>;
  /** Step at which each card was last answered. */
  lastSeen: Record<string, number>;
  roundNumber: number;
  /** Cards still to be answered correctly this round. queue[0] is current. */
  queue: string[];
  cleared: string[];
  /** Answers given per card in this round. */
  attempts: Record<string, number>;
  phase: LearnPhase;
  question: Question | null;
  feedback: LearnFeedback | null;
  streak: number;
  answered: number;
  correctCount: number;
};

export type LearnEvent =
  | { type: 'answer'; answer: LearnAnswer }
  | { type: 'override' }
  | { type: 'continue' }
  | { type: 'nextRound' };

function stageOf(state: Pick<LearnState, 'stages'>, cardId: string): Stage {
  return state.stages[cardId] ?? 0;
}

function allMastered(state: LearnState): boolean {
  return state.cardIds.every((id) => stageOf(state, id) === 2);
}

function generateQuestion(state: LearnState, cardId: string, cards: readonly StudyCard[]) {
  const card = cards.find((candidate) => candidate.id === cardId);
  if (!card) return null;

  const { config } = state;
  const stage = stageOf(state, cardId);
  const rng = createRng((state.seed + Math.imul(state.step + 1, 0x9e3779b1)) >>> 0);
  const inScope = new Set(state.cardIds);
  const pool =
    cards.length === inScope.size ? cards : cards.filter((candidate) => inScope.has(candidate.id));

  const recognition = stage === 0 || !config.written;
  if (recognition && (config.multipleChoice || config.trueFalse)) {
    const preferTrueFalse = config.trueFalse && (!config.multipleChoice || rng.next() < 0.25);
    if (preferTrueFalse) return makeTrueFalse(card, pool, config.answerWith, rng);

    // A Familiar card with written turned off gets harder wrong options.
    const multipleChoice = makeMultipleChoice(card, pool, config.answerWith, rng, stage === 1);
    if (multipleChoice) return multipleChoice;
    if (config.trueFalse) return makeTrueFalse(card, pool, config.answerWith, rng);
  }
  return makeWritten(card, config.answerWith);
}

function startRound(state: LearnState, cards: readonly StudyCard[]): LearnState {
  if (allMastered(state)) {
    return { ...state, phase: 'finished', question: null, feedback: null, queue: [], cleared: [] };
  }

  // Familiar cards first, least recently seen first; then New cards in set order.
  const familiar = state.cardIds
    .filter((id) => stageOf(state, id) === 1)
    .sort((a, b) => (state.lastSeen[a] ?? -1) - (state.lastSeen[b] ?? -1));
  const fresh = state.cardIds.filter((id) => stageOf(state, id) === 0);
  const queue = [...familiar, ...fresh].slice(0, Math.max(1, state.config.roundSize));

  const next: LearnState = {
    ...state,
    roundNumber: state.roundNumber + 1,
    queue,
    cleared: [],
    attempts: {},
    phase: 'question',
    feedback: null,
    question: null,
  };
  return { ...next, question: generateQuestion(next, queue[0], cards) };
}

export function createLearnSession(
  cards: readonly StudyCard[],
  config: LearnConfig,
  seed: number,
  initialStages: Record<string, Stage> = {},
): LearnState {
  const cardIds = cards.map((card) => card.id);
  const stages: Record<string, Stage> = {};
  for (const id of cardIds) stages[id] = initialStages[id] ?? 0;

  const empty: LearnState = {
    version: 1,
    config,
    seed,
    step: 0,
    cardIds,
    stages,
    lastSeen: {},
    roundNumber: 0,
    queue: [],
    cleared: [],
    attempts: {},
    phase: 'finished',
    question: null,
    feedback: null,
    streak: 0,
    answered: 0,
    correctCount: 0,
  };
  return startRound(empty, cards);
}

function isCorrect(question: Question, answer: LearnAnswer, grading: GradingMode): boolean {
  if (answer.kind === 'dontKnow') return false;
  switch (question.type) {
    case 'multipleChoice':
      return answer.kind === 'choice' && answer.index === question.correctIndex;
    case 'trueFalse':
      return answer.kind === 'boolean' && answer.value === question.isTrue;
    case 'written':
      return answer.kind === 'text' && gradeWritten(answer.text, question.answer, grading);
  }
}

function describeAnswer(question: Question, answer: LearnAnswer): string {
  switch (answer.kind) {
    case 'choice':
      return question.type === 'multipleChoice' ? (question.options[answer.index] ?? '') : '';
    case 'boolean':
      return answer.value ? 'True' : 'False';
    case 'text':
      return answer.text;
    case 'dontKnow':
      return '';
  }
}

/** The answer that is marked right for a question. */
export function correctAnswerFor(question: Question): LearnAnswer {
  switch (question.type) {
    case 'multipleChoice':
      return { kind: 'choice', index: question.correctIndex };
    case 'trueFalse':
      return { kind: 'boolean', value: question.isTrue };
    case 'written':
      return { kind: 'text', text: question.answer };
  }
}

function snapshot(state: LearnState): Snapshot {
  return {
    stages: state.stages,
    lastSeen: state.lastSeen,
    queue: state.queue,
    cleared: state.cleared,
    attempts: state.attempts,
    streak: state.streak,
    answered: state.answered,
    correctCount: state.correctCount,
  };
}

/** Applies one graded answer for the card at the front of the queue. */
function applyGrade(base: Snapshot, cardId: string, correct: boolean, step: number): Snapshot {
  const stage = base.stages[cardId] ?? 0;
  const attempts = { ...base.attempts, [cardId]: (base.attempts[cardId] ?? 0) + 1 };
  const firstTry = attempts[cardId] === 1;
  const rest = base.queue.filter((id) => id !== cardId);
  const lastSeen = { ...base.lastSeen, [cardId]: step };

  if (correct) {
    return {
      stages: { ...base.stages, [cardId]: Math.min(2, stage + 1) as Stage },
      lastSeen,
      queue: rest,
      cleared: [...base.cleared, cardId],
      attempts,
      streak: firstTry ? base.streak + 1 : base.streak,
      answered: base.answered + 1,
      correctCount: base.correctCount + 1,
    };
  }

  // Bring the card back at least two questions later when the round allows it.
  const position = Math.min(2, rest.length);
  return {
    stages: { ...base.stages, [cardId]: Math.max(0, stage - 1) as Stage },
    lastSeen,
    queue: [...rest.slice(0, position), cardId, ...rest.slice(position)],
    cleared: base.cleared,
    attempts,
    streak: 0,
    answered: base.answered + 1,
    correctCount: base.correctCount,
  };
}

export function learnReducer(
  state: LearnState,
  event: LearnEvent,
  cards: readonly StudyCard[],
): LearnState {
  switch (event.type) {
    case 'answer': {
      const question = state.question;
      if (state.phase !== 'question' || question === null) return state;

      const correct = isCorrect(question, event.answer, state.config.grading);
      const before = snapshot(state);
      return {
        ...state,
        ...applyGrade(before, question.cardId, correct, state.step),
        step: state.step + 1,
        phase: 'feedback',
        feedback: {
          cardId: question.cardId,
          correct,
          given: describeAnswer(question, event.answer),
          expected: question.answer,
          prompt: question.prompt,
          questionType: question.type,
          overridden: false,
          before,
        },
      };
    }

    case 'override': {
      const feedback = state.feedback;
      if (state.phase !== 'feedback' || feedback === null) return state;
      if (feedback.correct || feedback.overridden) return state;

      // Replay the same answer as correct from the state before it was graded.
      return {
        ...state,
        ...applyGrade(feedback.before, feedback.cardId, true, state.step - 1),
        feedback: { ...feedback, correct: true, overridden: true },
      };
    }

    case 'continue': {
      if (state.phase !== 'feedback') return state;
      if (state.queue.length === 0) {
        return allMastered(state)
          ? { ...state, phase: 'finished', question: null, feedback: null }
          : { ...state, phase: 'checkpoint', question: null, feedback: null };
      }
      const next: LearnState = { ...state, phase: 'question', feedback: null, question: null };
      return { ...next, question: generateQuestion(next, next.queue[0], cards) };
    }

    case 'nextRound':
      return state.phase === 'checkpoint' ? startRound(state, cards) : state;
  }
}

export type LearnProgress = { fresh: number; familiar: number; mastered: number; total: number };

export function learnProgress(state: Pick<LearnState, 'cardIds' | 'stages'>): LearnProgress {
  const progress: LearnProgress = {
    fresh: 0,
    familiar: 0,
    mastered: 0,
    total: state.cardIds.length,
  };
  for (const id of state.cardIds) {
    const stage = stageOf(state, id);
    if (stage === 2) progress.mastered++;
    else if (stage === 1) progress.familiar++;
    else progress.fresh++;
  }
  return progress;
}

/**
 * True when a value read back from storage is a usable session for these
 * cards. Anything else is discarded and a new session starts.
 */
export function isValidLearnState(value: unknown, cardIds: readonly string[]): value is LearnState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<LearnState>;
  if (state.version !== 1 || typeof state.config !== 'object' || state.config === null) {
    return false;
  }
  if (!Array.isArray(state.cardIds) || !Array.isArray(state.queue)) return false;
  if (typeof state.stages !== 'object' || state.stages === null) return false;
  if (!['question', 'feedback', 'checkpoint', 'finished'].includes(state.phase ?? '')) return false;
  if (state.phase === 'question' && !state.question) return false;
  if (state.phase === 'feedback' && !state.feedback) return false;

  // The set must not have gained or lost cards since the session was saved.
  if (state.cardIds.length !== cardIds.length) return false;
  const known = new Set(cardIds);
  return state.cardIds.every((id) => known.has(id));
}
