import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { planMigrations, type MigrationBundle } from './migrationPlan';
import migrations from './migrations/migrations';
import * as schema from './schema';

export const DATABASE_NAME = 'quizr.db';

/**
 * Everything here uses expo-sqlite's ASYNC API on purpose.
 *
 * On web the synchronous API needs SharedArrayBuffer, which browsers only give
 * to cross-origin isolated pages (special COOP/COEP headers on every host), and
 * it blocks the main thread. The async API talks to the SQLite worker with
 * plain messages, so the web build runs on any static host. Drizzle's own
 * expo-sqlite driver is sync-only, which is why the proxy driver is used.
 */
let sqlitePromise: Promise<SQLiteDatabase> | null = null;

export function getSqlite(): Promise<SQLiteDatabase> {
  sqlitePromise ??= openDatabaseAsync(DATABASE_NAME).then(async (sqlite) => {
    await sqlite.execAsync('PRAGMA foreign_keys = ON;');
    return sqlite;
  });
  return sqlitePromise;
}

export const db = drizzle(
  async (sql, params, method) => {
    const sqlite = await getSqlite();

    if (method === 'run') {
      await sqlite.runAsync(sql, params);
      return { rows: [] };
    }

    // Raw results come back as arrays of values, which is what Drizzle expects
    // and avoids column-name clashes in joins.
    const statement = await sqlite.prepareAsync(sql);
    try {
      const result = await statement.executeForRawResultAsync<Record<string, unknown>>(params);
      if (method === 'get') {
        const first = await result.getFirstAsync();
        // Drizzle's proxy contract: "get" returns the row itself, or undefined.
        return { rows: (first ?? undefined) as unknown as unknown[] };
      }
      return { rows: await result.getAllAsync() };
    } finally {
      await statement.finalizeAsync();
    }
  },
  { schema },
);

export type Database = typeof db;

const MIGRATIONS_TABLE = '__drizzle_migrations';

/** Opens the database and applies any schema migrations that have not run yet. */
export async function prepareDatabase(): Promise<void> {
  const sqlite = await getSqlite();

  await sqlite.execAsync(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );`,
  );

  const last = await sqlite.getFirstAsync<{ created_at: number }>(
    `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
  );
  const pending = planMigrations(migrations as MigrationBundle, last?.created_at ?? null);

  for (const migration of pending) {
    // One transaction per migration: it applies completely or not at all.
    await sqlite.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await sqlite.execAsync(statement);
      }
      await sqlite.runAsync(
        `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
        migration.tag,
        migration.when,
      );
    });
  }
}
