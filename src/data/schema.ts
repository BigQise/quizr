import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A study set. Ids are UUID strings so rows can be synced across devices later
 * without renumbering. Timestamps are Unix milliseconds.
 */
export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type SetRow = typeof sets.$inferSelect;
export type NewSetRow = typeof sets.$inferInsert;
