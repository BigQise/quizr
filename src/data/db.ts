import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { MigrationBundle } from './migrationPlan';
import migrations from './migrations/migrations';
import { runMigrations, type SqlDb } from './sqlDb';

export const DATABASE_NAME = 'quizr.db';

/**
 * Everything here uses expo-sqlite's ASYNC API on purpose.
 *
 * On web the synchronous API needs SharedArrayBuffer, which browsers only give
 * to cross-origin isolated pages (special COOP/COEP headers on every host), and
 * it blocks the main thread. The async API talks to the SQLite worker with
 * plain messages, so the web build runs on any static host.
 */
let sqlitePromise: Promise<SQLiteDatabase> | null = null;

function openSqlite(): Promise<SQLiteDatabase> {
  sqlitePromise ??= openDatabaseAsync(DATABASE_NAME).then(async (sqlite) => {
    await sqlite.execAsync('PRAGMA foreign_keys = ON;');
    return sqlite;
  });
  return sqlitePromise;
}

let readyPromise: Promise<SqlDb> | null = null;

/** The open, fully migrated database. Safe to call from anywhere, any number of times. */
export function getDatabase(): Promise<SqlDb> {
  readyPromise ??= openSqlite().then(async (sqlite) => {
    await runMigrations(sqlite, migrations as MigrationBundle);
    return sqlite;
  });
  // A failed open must not be cached, or the app could never recover.
  readyPromise.catch(() => {
    readyPromise = null;
    sqlitePromise = null;
  });
  return readyPromise;
}

/** Opens the database and applies any schema migrations that have not run yet. */
export async function prepareDatabase(): Promise<void> {
  await getDatabase();
}
