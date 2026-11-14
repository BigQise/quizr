import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The database schema. drizzle-kit reads this file to generate migrations
 * (`bun run db:generate`); the app itself talks to SQLite with plain SQL in
 * src/data/sqliteRepos.ts.
 *
 * Ids are UUID strings so rows can be synced across devices later without
 * renumbering. Timestamps are Unix milliseconds.
 */
export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    term: text('term').notNull(),
    definition: text('definition').notNull(),
    position: integer('position').notNull(),
    starred: integer('starred').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('cards_set_position_idx').on(table.setId, table.position)],
);

/** Per-card study progress outside any one session. */
export const cardState = sqliteTable('card_state', {
  cardId: text('card_id')
    .primaryKey()
    .references(() => cards.id, { onDelete: 'cascade' }),
  /** Flashcards sorting: unsorted, stillLearning, or know. */
  sortStatus: text('sort_status').notNull().default('unsorted'),
  /** Learn: 0 new, 1 familiar, 2 mastered. */
  learnStage: integer('learn_stage').notNull().default(0),
  lastAnsweredAt: integer('last_answered_at'),
});

/** One resumable session per set and study mode, stored as JSON. */
export const sessions = sqliteTable(
  'sessions',
  {
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    stateJson: text('state_json').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.setId, table.mode] })],
);

export const testAttempts = sqliteTable(
  'test_attempts',
  {
    id: text('id').primaryKey(),
    setId: text('set_id')
      .notNull()
      .references(() => sets.id, { onDelete: 'cascade' }),
    /** The generated test and the answers given, as JSON. */
    testJson: text('test_json').notNull(),
    answersJson: text('answers_json').notNull(),
    earned: integer('earned').notNull(),
    possible: integer('possible').notNull(),
    submittedAt: integer('submitted_at').notNull(),
  },
  (table) => [index('test_attempts_set_idx').on(table.setId, table.submittedAt)],
);

/** Append-only record of every answer. Feeds statistics. */
export const reviewLog = sqliteTable(
  'review_log',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(),
    questionType: text('question_type').notNull(),
    correct: integer('correct').notNull(),
    rating: text('rating'),
    answeredAt: integer('answered_at').notNull(),
  },
  (table) => [index('review_log_card_idx').on(table.cardId, table.answeredAt)],
);

/** Spaced repetition: one row per card that has been studied that way. */
export const srsState = sqliteTable(
  'srs_state',
  {
    cardId: text('card_id')
      .primaryKey()
      .references(() => cards.id, { onDelete: 'cascade' }),
    /** When the card is next due. Duplicated from the JSON so it can be indexed. */
    due: integer('due').notNull(),
    /** The scheduler's card (src/core/srs), as JSON. */
    stateJson: text('state_json').notNull(),
    /** When the card was first studied; counts against that day's new-card limit. */
    introducedAt: integer('introduced_at').notNull(),
  },
  (table) => [index('srs_state_due_idx').on(table.due)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
