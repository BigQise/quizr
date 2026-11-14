import type { Pile } from '@/core/flashcards/deck';
import type { SrsCard } from '@/core/srs/scheduler';
import type { GeneratedTest, TestAnswer } from '@/core/test/generate';

/**
 * Everything the screens can ask of storage. Screens get this from
 * `useRepos()` and never touch SQLite themselves.
 */
export type SetSummary = {
  id: string;
  title: string;
  description: string;
  cardCount: number;
  /** Spaced-repetition reviews due now. */
  dueCount: number;
  updatedAt: number;
};

export type SetRecord = { id: string; title: string; description: string };

export type SortStatus = 'unsorted' | Pile;

export type CardRecord = {
  id: string;
  setId: string;
  term: string;
  definition: string;
  position: number;
  starred: boolean;
  sortStatus: SortStatus;
  /** 0 new, 1 familiar, 2 mastered. */
  learnStage: number;
};

export type CardInput = { term: string; definition: string };

export type SessionMode = 'flashcards' | 'learn';

export type ReviewEntry = {
  cardId: string;
  mode: 'learn' | 'test' | 'flashcards' | 'srs';
  questionType: string;
  correct: boolean;
  rating?: string;
};

export type TestAttemptSummary = {
  id: string;
  earned: number;
  possible: number;
  submittedAt: number;
};

export type TestAttempt = TestAttemptSummary & {
  setId: string;
  test: GeneratedTest;
  answers: TestAnswer[];
};

export type SrsRecord = { srs: SrsCard; introducedAt: number };

/** A full copy of the database, table by table, for backup and restore. */
export type Backup = {
  app: 'quizr';
  version: 1;
  exportedAt: number;
  tables: Record<string, Record<string, string | number | null>[]>;
};

export interface Repos {
  // Sets
  listSets(): Promise<SetSummary[]>;
  getSet(setId: string): Promise<SetRecord | null>;
  createSet(input: { title: string; description: string }): Promise<string>;
  updateSet(setId: string, input: { title: string; description: string }): Promise<void>;
  deleteSet(setId: string): Promise<void>;

  // Cards
  listCards(setId: string): Promise<CardRecord[]>;
  getCard(cardId: string): Promise<CardRecord | null>;
  addCard(setId: string, input: CardInput): Promise<string>;
  updateCard(cardId: string, input: CardInput): Promise<void>;
  deleteCard(cardId: string): Promise<void>;
  setStarred(cardId: string, starred: boolean): Promise<void>;
  /** Swaps a card with its neighbour. direction -1 is up, 1 is down. */
  moveCard(cardId: string, direction: -1 | 1): Promise<void>;
  /** Appends many cards in one transaction. Returns how many were added. */
  importCards(setId: string, inputs: readonly CardInput[]): Promise<number>;

  // Study progress
  setSortStatus(cardId: string, status: SortStatus): Promise<void>;
  resetSortStatus(setId: string): Promise<void>;
  setLearnStage(cardId: string, stage: number): Promise<void>;
  resetLearnProgress(setId: string): Promise<void>;
  logReview(entry: ReviewEntry): Promise<void>;

  // Resumable sessions. The value is whatever JSON the study mode saved.
  loadSession(setId: string, mode: SessionMode): Promise<unknown>;
  saveSession(setId: string, mode: SessionMode, state: unknown): Promise<void>;
  clearSession(setId: string, mode: SessionMode): Promise<void>;

  // Tests
  saveTestAttempt(
    setId: string,
    attempt: { test: GeneratedTest; answers: TestAnswer[]; earned: number; possible: number },
  ): Promise<string>;
  listTestAttempts(setId: string): Promise<TestAttemptSummary[]>;
  getTestAttempt(attemptId: string): Promise<TestAttempt | null>;

  // Spaced repetition
  listSrs(setId: string): Promise<Record<string, SrsRecord>>;
  saveSrs(cardId: string, record: SrsRecord): Promise<void>;
  /** How many cards were first studied at or after `since`, across all sets. */
  countIntroducedSince(since: number): Promise<number>;

  // Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // Backup
  exportBackup(): Promise<Backup>;
  /** Replaces everything in the database with the backup's contents. */
  importBackup(backup: unknown): Promise<void>;
}

export const SETTING_NEW_CARDS_PER_DAY = 'srs.newCardsPerDay';
export const DEFAULT_NEW_CARDS_PER_DAY = 20;
