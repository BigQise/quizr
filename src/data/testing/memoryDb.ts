import type { MigrationBundle } from '../migrationPlan';
import migrations from '../migrations/migrations';
import type { Repos } from '../repos';
import { runMigrations, type SqlDb, type SqlValue } from '../sqlDb';
import { createSqliteRepos } from '../sqliteRepos';

/**
 * Test-only: a real SQLite database in memory, using Node's built-in
 * node:sqlite. It runs the same migrations and the same SQL as the app, so
 * repository tests exercise the real queries without a device or a browser.
 */
type NodeStatement = {
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
  run(...params: SqlValue[]): unknown;
};
type NodeDatabase = {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
};

function openNodeDatabase(): NodeDatabase {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (path: string) => NodeDatabase;
  };
  return new DatabaseSync(':memory:');
}

export function createMemoryDb(): SqlDb & { close(): void } {
  const database = openNodeDatabase();
  database.exec('PRAGMA foreign_keys = ON;');

  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async runAsync(sql, params) {
      return database.prepare(sql).run(...params);
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      // node:sqlite returns null-prototype objects; copy them into plain ones.
      return database
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...(row as object) })) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      const row = database.prepare(sql).get(...params);
      return row === undefined ? null : ({ ...(row as object) } as T);
    },
    async withTransactionAsync(task) {
      database.exec('BEGIN');
      try {
        await task();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}

export type TestRepos = {
  repos: Repos;
  db: SqlDb;
  /** The clock the repositories read. Tests move it forward by assigning. */
  clock: { now: number };
  close(): void;
};

/** Fully migrated in-memory repositories with predictable ids and a settable clock. */
export async function createTestRepos(): Promise<TestRepos> {
  const db = createMemoryDb();
  await runMigrations(db, migrations as MigrationBundle);

  const clock = { now: 1_000_000 };
  let counter = 0;
  const repos = createSqliteRepos({
    getDb: async () => db,
    newId: () => `id-${++counter}`,
    now: () => clock.now,
  });
  return { repos, db, clock, close: () => db.close() };
}
