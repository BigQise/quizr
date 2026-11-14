import type {
  Backup,
  CardInput,
  CardRecord,
  Repos,
  SetRecord,
  SetSummary,
  SortStatus,
  SrsRecord,
  TestAttempt,
  TestAttemptSummary,
} from './repos';
import type { SqlDb, SqlValue } from './sqlDb';

export type RepoDeps = {
  /** The open, migrated database. */
  getDb: () => Promise<SqlDb>;
  newId: () => string;
  now: () => number;
};

/** Rows per INSERT when importing. 8 columns × 100 stays under SQLite's variable limit. */
const IMPORT_CHUNK = 100;

/**
 * Tables and columns included in a backup, in an order that satisfies foreign
 * keys on restore. Only these columns are ever read from an imported file.
 */
export const BACKUP_TABLES: Record<string, readonly string[]> = {
  sets: ['id', 'title', 'description', 'created_at', 'updated_at'],
  cards: ['id', 'set_id', 'term', 'definition', 'position', 'starred', 'created_at', 'updated_at'],
  card_state: ['card_id', 'sort_status', 'learn_stage', 'last_answered_at'],
  sessions: ['set_id', 'mode', 'state_json', 'updated_at'],
  test_attempts: [
    'id',
    'set_id',
    'test_json',
    'answers_json',
    'earned',
    'possible',
    'submitted_at',
  ],
  review_log: ['id', 'card_id', 'mode', 'question_type', 'correct', 'rating', 'answered_at'],
  srs_state: ['card_id', 'due', 'state_json', 'introduced_at'],
  settings: ['key', 'value'],
};

type CardRow = {
  id: string;
  set_id: string;
  term: string;
  definition: string;
  position: number;
  starred: number;
  sort_status: string | null;
  learn_stage: number | null;
};

const CARD_SELECT = `
  SELECT c.id, c.set_id, c.term, c.definition, c.position, c.starred,
         s.sort_status, s.learn_stage
  FROM cards c
  LEFT JOIN card_state s ON s.card_id = c.id`;

function toCard(row: CardRow): CardRecord {
  const sortStatus: SortStatus =
    row.sort_status === 'know' || row.sort_status === 'stillLearning'
      ? row.sort_status
      : 'unsorted';
  return {
    id: row.id,
    setId: row.set_id,
    term: row.term,
    definition: row.definition,
    position: row.position,
    starred: row.starred === 1,
    sortStatus,
    learnStage: row.learn_stage ?? 0,
  };
}

function parseJson(text: string | null | undefined): unknown {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A corrupt value is treated as missing, never as a crash.
    return null;
  }
}

function isBackup(value: unknown): value is Backup {
  if (typeof value !== 'object' || value === null) return false;
  const backup = value as Partial<Backup>;
  if (backup.app !== 'quizr' || backup.version !== 1) return false;
  if (typeof backup.tables !== 'object' || backup.tables === null) return false;
  return Object.keys(BACKUP_TABLES).every((table) => {
    const rows = backup.tables![table];
    return (
      rows === undefined ||
      (Array.isArray(rows) && rows.every((row) => typeof row === 'object' && row !== null))
    );
  });
}

export function createSqliteRepos({ getDb, newId, now }: RepoDeps): Repos {
  async function touchSet(db: SqlDb, setId: string) {
    await db.runAsync('UPDATE sets SET updated_at = ? WHERE id = ?', [now(), setId]);
  }

  async function nextPosition(db: SqlDb, setId: string): Promise<number> {
    const row = await db.getFirstAsync<{ next: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM cards WHERE set_id = ?',
      [setId],
    );
    return row?.next ?? 0;
  }

  async function upsertCardState(
    db: SqlDb,
    cardId: string,
    column: 'sort_status' | 'learn_stage',
    value: SqlValue,
  ) {
    await db.runAsync(
      `INSERT INTO card_state (card_id, ${column}, last_answered_at) VALUES (?, ?, ?)
       ON CONFLICT(card_id) DO UPDATE SET ${column} = excluded.${column},
         last_answered_at = excluded.last_answered_at`,
      [cardId, value, now()],
    );
  }

  return {
    async listSets() {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        id: string;
        title: string;
        description: string;
        updated_at: number;
        card_count: number;
        due_count: number;
      }>(
        `SELECT s.id, s.title, s.description, s.updated_at,
           (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.id) AS card_count,
           (SELECT COUNT(*) FROM srs_state r JOIN cards c ON c.id = r.card_id
             WHERE c.set_id = s.id AND r.due <= ?) AS due_count
         FROM sets s
         ORDER BY s.updated_at DESC, s.title`,
        [now()],
      );
      return rows.map((row): SetSummary => ({
        id: row.id,
        title: row.title,
        description: row.description,
        cardCount: row.card_count,
        dueCount: row.due_count,
        updatedAt: row.updated_at,
      }));
    },

    async getSet(setId) {
      const db = await getDb();
      return db.getFirstAsync<SetRecord>('SELECT id, title, description FROM sets WHERE id = ?', [
        setId,
      ]);
    },

    async createSet({ title, description }) {
      const db = await getDb();
      const id = newId();
      const time = now();
      await db.runAsync(
        'INSERT INTO sets (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, title, description, time, time],
      );
      return id;
    },

    async updateSet(setId, { title, description }) {
      const db = await getDb();
      await db.runAsync('UPDATE sets SET title = ?, description = ?, updated_at = ? WHERE id = ?', [
        title,
        description,
        now(),
        setId,
      ]);
    },

    async deleteSet(setId) {
      const db = await getDb();
      // Cards, progress, sessions, attempts, and logs go with it (ON DELETE CASCADE).
      await db.runAsync('DELETE FROM sets WHERE id = ?', [setId]);
    },

    async listCards(setId) {
      const db = await getDb();
      const rows = await db.getAllAsync<CardRow>(
        `${CARD_SELECT} WHERE c.set_id = ? ORDER BY c.position, c.created_at`,
        [setId],
      );
      return rows.map(toCard);
    },

    async getCard(cardId) {
      const db = await getDb();
      const row = await db.getFirstAsync<CardRow>(`${CARD_SELECT} WHERE c.id = ?`, [cardId]);
      return row ? toCard(row) : null;
    },

    async addCard(setId, { term, definition }) {
      const db = await getDb();
      const id = newId();
      const time = now();
      await db.runAsync(
        `INSERT INTO cards (id, set_id, term, definition, position, starred, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [id, setId, term, definition, await nextPosition(db, setId), time, time],
      );
      await touchSet(db, setId);
      return id;
    },

    async updateCard(cardId, { term, definition }) {
      const db = await getDb();
      await db.runAsync('UPDATE cards SET term = ?, definition = ?, updated_at = ? WHERE id = ?', [
        term,
        definition,
        now(),
        cardId,
      ]);
    },

    async deleteCard(cardId) {
      const db = await getDb();
      await db.runAsync('DELETE FROM cards WHERE id = ?', [cardId]);
    },

    async setStarred(cardId, starred) {
      const db = await getDb();
      await db.runAsync('UPDATE cards SET starred = ? WHERE id = ?', [starred ? 1 : 0, cardId]);
    },

    async moveCard(cardId, direction) {
      const db = await getDb();
      const card = await db.getFirstAsync<{ set_id: string; position: number }>(
        'SELECT set_id, position FROM cards WHERE id = ?',
        [cardId],
      );
      if (!card) return;

      const neighbour = await db.getFirstAsync<{ id: string; position: number }>(
        direction === -1
          ? 'SELECT id, position FROM cards WHERE set_id = ? AND position < ? ORDER BY position DESC LIMIT 1'
          : 'SELECT id, position FROM cards WHERE set_id = ? AND position > ? ORDER BY position ASC LIMIT 1',
        [card.set_id, card.position],
      );
      if (!neighbour) return;

      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE cards SET position = ? WHERE id = ?', [
          neighbour.position,
          cardId,
        ]);
        await db.runAsync('UPDATE cards SET position = ? WHERE id = ?', [
          card.position,
          neighbour.id,
        ]);
      });
    },

    async importCards(setId, inputs: readonly CardInput[]) {
      if (inputs.length === 0) return 0;
      const db = await getDb();
      const time = now();
      let position = await nextPosition(db, setId);

      await db.withTransactionAsync(async () => {
        for (let start = 0; start < inputs.length; start += IMPORT_CHUNK) {
          const chunk = inputs.slice(start, start + IMPORT_CHUNK);
          const params: SqlValue[] = [];
          for (const input of chunk) {
            params.push(newId(), setId, input.term, input.definition, position++, time, time);
          }
          await db.runAsync(
            `INSERT INTO cards (id, set_id, term, definition, position, starred, created_at, updated_at)
             VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, 0, ?, ?)').join(', ')}`,
            params,
          );
        }
        await touchSet(db, setId);
      });
      return inputs.length;
    },

    async setSortStatus(cardId, status) {
      await upsertCardState(await getDb(), cardId, 'sort_status', status);
    },

    async resetSortStatus(setId) {
      const db = await getDb();
      await db.runAsync(
        `UPDATE card_state SET sort_status = 'unsorted'
         WHERE card_id IN (SELECT id FROM cards WHERE set_id = ?)`,
        [setId],
      );
    },

    async setLearnStage(cardId, stage) {
      await upsertCardState(await getDb(), cardId, 'learn_stage', stage);
    },

    async resetLearnProgress(setId) {
      const db = await getDb();
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE card_state SET learn_stage = 0
           WHERE card_id IN (SELECT id FROM cards WHERE set_id = ?)`,
          [setId],
        );
        await db.runAsync("DELETE FROM sessions WHERE set_id = ? AND mode = 'learn'", [setId]);
      });
    },

    async logReview(entry) {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO review_log (id, card_id, mode, question_type, correct, rating, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          entry.cardId,
          entry.mode,
          entry.questionType,
          entry.correct ? 1 : 0,
          entry.rating ?? null,
          now(),
        ],
      );
    },

    async loadSession(setId, mode) {
      const db = await getDb();
      const row = await db.getFirstAsync<{ state_json: string }>(
        'SELECT state_json FROM sessions WHERE set_id = ? AND mode = ?',
        [setId, mode],
      );
      return parseJson(row?.state_json);
    },

    async saveSession(setId, mode, state) {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO sessions (set_id, mode, state_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(set_id, mode) DO UPDATE SET state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
        [setId, mode, JSON.stringify(state), now()],
      );
    },

    async clearSession(setId, mode) {
      const db = await getDb();
      await db.runAsync('DELETE FROM sessions WHERE set_id = ? AND mode = ?', [setId, mode]);
    },

    async saveTestAttempt(setId, attempt) {
      const db = await getDb();
      const id = newId();
      await db.runAsync(
        `INSERT INTO test_attempts (id, set_id, test_json, answers_json, earned, possible, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          setId,
          JSON.stringify(attempt.test),
          JSON.stringify(attempt.answers),
          attempt.earned,
          attempt.possible,
          now(),
        ],
      );
      return id;
    },

    async listTestAttempts(setId) {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        id: string;
        earned: number;
        possible: number;
        submitted_at: number;
      }>(
        `SELECT id, earned, possible, submitted_at FROM test_attempts
         WHERE set_id = ? ORDER BY submitted_at DESC`,
        [setId],
      );
      return rows.map((row): TestAttemptSummary => ({
        id: row.id,
        earned: row.earned,
        possible: row.possible,
        submittedAt: row.submitted_at,
      }));
    },

    async getTestAttempt(attemptId) {
      const db = await getDb();
      const row = await db.getFirstAsync<{
        id: string;
        set_id: string;
        test_json: string;
        answers_json: string;
        earned: number;
        possible: number;
        submitted_at: number;
      }>('SELECT * FROM test_attempts WHERE id = ?', [attemptId]);
      if (!row) return null;

      const test = parseJson(row.test_json);
      const answers = parseJson(row.answers_json);
      if (test === null || !Array.isArray(answers)) return null;
      return {
        id: row.id,
        setId: row.set_id,
        test: test as TestAttempt['test'],
        answers: answers as TestAttempt['answers'],
        earned: row.earned,
        possible: row.possible,
        submittedAt: row.submitted_at,
      };
    },

    async listSrs(setId) {
      const db = await getDb();
      const rows = await db.getAllAsync<{
        card_id: string;
        state_json: string;
        introduced_at: number;
      }>(
        `SELECT r.card_id, r.state_json, r.introduced_at FROM srs_state r
         JOIN cards c ON c.id = r.card_id WHERE c.set_id = ?`,
        [setId],
      );
      const records: Record<string, SrsRecord> = {};
      for (const row of rows) {
        const srs = parseJson(row.state_json);
        if (srs !== null) {
          records[row.card_id] = {
            srs: srs as SrsRecord['srs'],
            introducedAt: row.introduced_at,
          };
        }
      }
      return records;
    },

    async saveSrs(cardId, { srs, introducedAt }) {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO srs_state (card_id, due, state_json, introduced_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET due = excluded.due, state_json = excluded.state_json`,
        [cardId, srs.due, JSON.stringify(srs), introducedAt],
      );
    },

    async countIntroducedSince(since) {
      const db = await getDb();
      const row = await db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) AS total FROM srs_state WHERE introduced_at >= ?',
        [since],
      );
      return row?.total ?? 0;
    },

    async getSetting(key) {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key],
      );
      return row?.value ?? null;
    },

    async setSetting(key, value) {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    },

    async exportBackup() {
      const db = await getDb();
      const tables: Backup['tables'] = {};
      for (const [table, columns] of Object.entries(BACKUP_TABLES)) {
        tables[table] = await db.getAllAsync(`SELECT ${columns.join(', ')} FROM ${table}`, []);
      }
      return { app: 'quizr', version: 1, exportedAt: now(), tables };
    },

    async importBackup(backup) {
      if (!isBackup(backup)) {
        throw new Error('This is not a Quizr backup file.');
      }
      const db = await getDb();
      const tableNames = Object.keys(BACKUP_TABLES);

      // All or nothing: a bad row rolls the whole restore back.
      await db.withTransactionAsync(async () => {
        for (const table of [...tableNames].reverse()) {
          await db.runAsync(`DELETE FROM ${table}`, []);
        }
        for (const table of tableNames) {
          const columns = BACKUP_TABLES[table];
          const placeholders = columns.map(() => '?').join(', ');
          for (const row of backup.tables[table] ?? []) {
            const values = columns.map((column): SqlValue => {
              const value = row[column];
              return typeof value === 'string' || typeof value === 'number' ? value : null;
            });
            await db.runAsync(
              `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
              values,
            );
          }
        }
      });
    },
  };
}
