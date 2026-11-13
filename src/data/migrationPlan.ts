/**
 * Works out which schema migrations still need to run.
 *
 * drizzle-kit writes a journal plus one .sql file per migration, bundled by
 * src/data/migrations/migrations.js. This module is pure so the ordering and
 * splitting rules can be tested without a database.
 */

export type MigrationJournalEntry = {
  idx: number;
  /** Creation time in Unix ms. Doubles as the migration's identity. */
  when: number;
  tag: string;
};

export type MigrationBundle = {
  journal: { entries: MigrationJournalEntry[] };
  /** SQL text keyed by "m0000", "m0001", and so on. */
  migrations: Record<string, string>;
};

export type PlannedMigration = {
  tag: string;
  when: number;
  statements: string[];
};

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

export function migrationKey(idx: number): string {
  return `m${idx.toString().padStart(4, '0')}`;
}

export function splitStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * @param lastAppliedAt `when` of the newest migration already recorded in the
 *   database, or null for a brand-new database.
 */
export function planMigrations(
  bundle: MigrationBundle,
  lastAppliedAt: number | null,
): PlannedMigration[] {
  const entries = bundle.journal.entries.slice().sort((a, b) => a.idx - b.idx);

  return entries
    .filter((entry) => lastAppliedAt === null || entry.when > lastAppliedAt)
    .map((entry) => {
      const sql = bundle.migrations[migrationKey(entry.idx)];
      if (sql === undefined) {
        throw new Error(`Migration ${entry.tag} is in the journal but its SQL is missing.`);
      }
      return { tag: entry.tag, when: entry.when, statements: splitStatements(sql) };
    });
}
