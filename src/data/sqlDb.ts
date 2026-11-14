import { planMigrations, type MigrationBundle } from './migrationPlan';

export type SqlValue = string | number | null;

/**
 * The small part of a SQLite connection the app uses. expo-sqlite's
 * SQLiteDatabase satisfies it, and so does the node:sqlite adapter the tests
 * use, which is how the real SQL gets exercised in Jest.
 */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const MIGRATIONS_TABLE = '__drizzle_migrations';

/** Applies every migration in the bundle that the database has not seen. */
export async function runMigrations(db: SqlDb, bundle: MigrationBundle): Promise<void> {
  await db.execAsync(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );`,
  );

  const last = await db.getFirstAsync<{ created_at: number }>(
    `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    [],
  );

  for (const migration of planMigrations(bundle, last?.created_at ?? null)) {
    // One transaction per migration: it applies completely or not at all.
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.runAsync(`INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`, [
        migration.tag,
        migration.when,
      ]);
    });
  }
}
