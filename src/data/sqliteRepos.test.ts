import { newSrsCard, rateCard } from '@/core/srs/scheduler';
import { makeCards } from '@/core/testing';
import { DEFAULT_TEST_CONFIG, answerKey, generateTest, gradeTest } from '@/core/test/generate';

import type { MigrationBundle } from './migrationPlan';
import migrations from './migrations/migrations';
import { runMigrations } from './sqlDb';
import { createMemoryDb, createTestRepos, type TestRepos } from './testing/memoryDb';

let t: TestRepos;

beforeEach(async () => {
  t = await createTestRepos();
});

afterEach(() => {
  t.close();
});

async function seedSet(cardCount: number, title = 'Spanish') {
  const setId = await t.repos.createSet({ title, description: '' });
  await t.repos.importCards(
    setId,
    Array.from({ length: cardCount }, (_, i) => ({ term: `term ${i}`, definition: `def ${i}` })),
  );
  return setId;
}

describe('migrations', () => {
  it('apply once and are skipped on the next start', async () => {
    const db = createMemoryDb();
    await runMigrations(db, migrations as MigrationBundle);
    await runMigrations(db, migrations as MigrationBundle);

    const applied = await db.getAllAsync<{ hash: string }>(
      'SELECT hash FROM __drizzle_migrations ORDER BY created_at',
      [],
    );
    expect(applied).toHaveLength((migrations as MigrationBundle).journal.entries.length);
    db.close();
  });

  it('upgrade a database created by the first release', async () => {
    const bundle = migrations as MigrationBundle;
    const v1: MigrationBundle = {
      journal: { entries: bundle.journal.entries.filter((entry) => entry.idx <= 1) },
      migrations: bundle.migrations,
    };
    const db = createMemoryDb();
    await runMigrations(db, v1);
    await db.runAsync(
      "INSERT INTO sets (id, title, description, created_at, updated_at) VALUES ('s', 'Old', '', 1, 1)",
      [],
    );

    await runMigrations(db, bundle);

    // Old data is intact and the new tables exist.
    expect(await db.getAllAsync('SELECT title FROM sets', [])).toEqual([{ title: 'Old' }]);
    expect(await db.getAllAsync('SELECT * FROM srs_state', [])).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM settings', [])).toEqual([]);
    db.close();
  });
});

describe('sets', () => {
  it('creates, reads, renames, and lists sets with card counts', async () => {
    const setId = await seedSet(3);
    expect(await t.repos.getSet(setId)).toEqual({ id: setId, title: 'Spanish', description: '' });

    await t.repos.updateSet(setId, { title: 'Español', description: 'Unit 1' });
    expect(await t.repos.listSets()).toEqual([
      expect.objectContaining({ id: setId, title: 'Español', description: 'Unit 1', cardCount: 3 }),
    ]);
  });

  it('lists the most recently changed set first', async () => {
    const first = await seedSet(1, 'First');
    t.clock.now += 1000;
    const second = await seedSet(1, 'Second');
    expect((await t.repos.listSets()).map((set) => set.id)).toEqual([second, first]);

    t.clock.now += 1000;
    await t.repos.addCard(first, { term: 'a', definition: 'b' });
    expect((await t.repos.listSets()).map((set) => set.id)).toEqual([first, second]);
  });

  it('returns null for a set that does not exist', async () => {
    expect(await t.repos.getSet('missing')).toBeNull();
  });

  it('deleting a set removes its cards, progress, sessions, and attempts', async () => {
    const setId = await seedSet(2);
    const [card] = await t.repos.listCards(setId);
    await t.repos.setLearnStage(card.id, 2);
    await t.repos.saveSession(setId, 'learn', { any: 'thing' });
    await t.repos.logReview({
      cardId: card.id,
      mode: 'learn',
      questionType: 'written',
      correct: true,
    });
    await t.repos.saveSrs(card.id, { srs: newSrsCard(5), introducedAt: 5 });

    await t.repos.deleteSet(setId);

    for (const table of ['cards', 'card_state', 'sessions', 'review_log', 'srs_state']) {
      expect(await t.db.getAllAsync(`SELECT * FROM ${table}`, [])).toEqual([]);
    }
  });
});

describe('cards', () => {
  it('adds cards at the end, in order', async () => {
    const setId = await seedSet(2);
    await t.repos.addCard(setId, { term: 'last', definition: 'final' });

    const cards = await t.repos.listCards(setId);
    expect(cards.map((card) => card.term)).toEqual(['term 0', 'term 1', 'last']);
    expect(cards.map((card) => card.position)).toEqual([0, 1, 2]);
    expect(cards[0]).toMatchObject({ starred: false, sortStatus: 'unsorted', learnStage: 0 });
  });

  it('edits, stars, and deletes a card', async () => {
    const setId = await seedSet(2);
    const [first, second] = await t.repos.listCards(setId);

    await t.repos.updateCard(first.id, { term: 'hola', definition: 'hello' });
    await t.repos.setStarred(first.id, true);
    await t.repos.deleteCard(second.id);

    expect(await t.repos.listCards(setId)).toEqual([
      expect.objectContaining({ id: first.id, term: 'hola', definition: 'hello', starred: true }),
    ]);
    expect(await t.repos.getCard(first.id)).toMatchObject({ term: 'hola' });
    expect(await t.repos.getCard(second.id)).toBeNull();
  });

  it('moves a card up and down and stops at the ends', async () => {
    const setId = await seedSet(3);
    const [a, b, c] = await t.repos.listCards(setId);
    const order = async () => (await t.repos.listCards(setId)).map((card) => card.id);

    await t.repos.moveCard(a.id, 1);
    expect(await order()).toEqual([b.id, a.id, c.id]);

    await t.repos.moveCard(c.id, -1);
    expect(await order()).toEqual([b.id, c.id, a.id]);

    await t.repos.moveCard(b.id, -1);
    await t.repos.moveCard(a.id, 1);
    expect(await order()).toEqual([b.id, c.id, a.id]);
  });

  it('imports 2,000 cards in one go, after the existing ones', async () => {
    const setId = await seedSet(1);
    const inputs = Array.from({ length: 2000 }, (_, i) => ({ term: `t${i}`, definition: `d${i}` }));

    const start = performance.now();
    expect(await t.repos.importCards(setId, inputs)).toBe(2000);
    expect(performance.now() - start).toBeLessThan(2000);

    const cards = await t.repos.listCards(setId);
    expect(cards).toHaveLength(2001);
    expect(cards[1].term).toBe('t0');
    expect(cards[2000]).toMatchObject({ term: 't1999', position: 2000 });
    expect((await t.repos.listSets())[0].cardCount).toBe(2001);
  });

  it('importing nothing changes nothing', async () => {
    const setId = await seedSet(1);
    expect(await t.repos.importCards(setId, [])).toBe(0);
    expect(await t.repos.listCards(setId)).toHaveLength(1);
  });
});

describe('study progress', () => {
  it('remembers sort piles and learn stages independently', async () => {
    const setId = await seedSet(2);
    const [first, second] = await t.repos.listCards(setId);

    await t.repos.setSortStatus(first.id, 'know');
    await t.repos.setLearnStage(first.id, 1);
    await t.repos.setLearnStage(second.id, 2);

    const cards = await t.repos.listCards(setId);
    expect(cards[0]).toMatchObject({ sortStatus: 'know', learnStage: 1 });
    expect(cards[1]).toMatchObject({ sortStatus: 'unsorted', learnStage: 2 });
  });

  it('resets sorting without touching learn progress, and the reverse', async () => {
    const setId = await seedSet(1);
    const [card] = await t.repos.listCards(setId);
    await t.repos.setSortStatus(card.id, 'stillLearning');
    await t.repos.setLearnStage(card.id, 2);
    await t.repos.saveSession(setId, 'learn', { saved: true });
    await t.repos.saveSession(setId, 'flashcards', { saved: true });

    await t.repos.resetSortStatus(setId);
    expect((await t.repos.listCards(setId))[0]).toMatchObject({
      sortStatus: 'unsorted',
      learnStage: 2,
    });

    await t.repos.setSortStatus(card.id, 'know');
    await t.repos.resetLearnProgress(setId);
    expect((await t.repos.listCards(setId))[0]).toMatchObject({
      sortStatus: 'know',
      learnStage: 0,
    });
    expect(await t.repos.loadSession(setId, 'learn')).toBeNull();
    expect(await t.repos.loadSession(setId, 'flashcards')).toEqual({ saved: true });
  });

  it('logs reviews', async () => {
    const setId = await seedSet(1);
    const [card] = await t.repos.listCards(setId);
    await t.repos.logReview({
      cardId: card.id,
      mode: 'srs',
      questionType: 'flashcard',
      correct: true,
      rating: 'good',
    });

    expect(await t.db.getAllAsync('SELECT mode, correct, rating FROM review_log', [])).toEqual([
      { mode: 'srs', correct: 1, rating: 'good' },
    ]);
  });
});

describe('sessions', () => {
  it('saves, replaces, loads, and clears one session per set and mode', async () => {
    const setId = await seedSet(1);
    expect(await t.repos.loadSession(setId, 'learn')).toBeNull();

    await t.repos.saveSession(setId, 'learn', { step: 1 });
    await t.repos.saveSession(setId, 'learn', { step: 2, nested: [1, 2] });
    expect(await t.repos.loadSession(setId, 'learn')).toEqual({ step: 2, nested: [1, 2] });

    await t.repos.clearSession(setId, 'learn');
    expect(await t.repos.loadSession(setId, 'learn')).toBeNull();
  });

  it('treats a corrupt saved session as missing', async () => {
    const setId = await seedSet(1);
    await t.db.runAsync(
      "INSERT INTO sessions (set_id, mode, state_json, updated_at) VALUES (?, 'learn', '{not json', 1)",
      [setId],
    );
    expect(await t.repos.loadSession(setId, 'learn')).toBeNull();
  });
});

describe('test attempts', () => {
  it('saves an attempt and lists newest first', async () => {
    const setId = await seedSet(1);
    const test = generateTest(makeCards(8), { ...DEFAULT_TEST_CONFIG, count: 8 }, 3);
    const answers = answerKey(test);
    const result = gradeTest(test, answers);

    const first = await t.repos.saveTestAttempt(setId, { test, answers, earned: 5, possible: 8 });
    t.clock.now += 1000;
    const second = await t.repos.saveTestAttempt(setId, {
      test,
      answers,
      earned: result.earned,
      possible: result.possible,
    });

    expect((await t.repos.listTestAttempts(setId)).map((attempt) => attempt.id)).toEqual([
      second,
      first,
    ]);
    const loaded = await t.repos.getTestAttempt(second);
    expect(loaded).toMatchObject({ setId, earned: 8, possible: 8 });
    // Regrading the stored test and answers gives the stored score.
    expect(gradeTest(loaded!.test, loaded!.answers).earned).toBe(8);
    expect(await t.repos.getTestAttempt('missing')).toBeNull();
  });
});

describe('spaced repetition', () => {
  it('stores scheduling per card and counts due cards per set', async () => {
    const setId = await seedSet(3);
    const [a, b] = await t.repos.listCards(setId);
    const now = t.clock.now;

    await t.repos.saveSrs(a.id, {
      srs: rateCard(newSrsCard(now), 'again', now),
      introducedAt: now,
    });
    await t.repos.saveSrs(b.id, { srs: rateCard(newSrsCard(now), 'easy', now), introducedAt: now });

    const records = await t.repos.listSrs(setId);
    expect(Object.keys(records).sort()).toEqual([a.id, b.id].sort());
    expect(records[a.id].srs.reps).toBe(1);
    expect((await t.repos.listSets())[0].dueCount).toBe(0);

    t.clock.now = now + 30 * 60_000;
    expect((await t.repos.listSets())[0].dueCount).toBe(1);
  });

  it('keeps the first-studied time when a card is reviewed again', async () => {
    const setId = await seedSet(1);
    const [card] = await t.repos.listCards(setId);
    await t.repos.saveSrs(card.id, { srs: newSrsCard(100), introducedAt: 100 });
    await t.repos.saveSrs(card.id, { srs: newSrsCard(900), introducedAt: 900 });

    expect((await t.repos.listSrs(setId))[card.id]).toMatchObject({ introducedAt: 100 });
    expect((await t.repos.listSrs(setId))[card.id].srs.due).toBe(900);
    expect(await t.repos.countIntroducedSince(50)).toBe(1);
    expect(await t.repos.countIntroducedSince(101)).toBe(0);
  });
});

describe('settings', () => {
  it('reads back what was written, and null for unknown keys', async () => {
    expect(await t.repos.getSetting('k')).toBeNull();
    await t.repos.setSetting('k', '1');
    await t.repos.setSetting('k', '2');
    expect(await t.repos.getSetting('k')).toBe('2');
  });
});

describe('backup', () => {
  it('restores everything into an empty database', async () => {
    const setId = await seedSet(3);
    const [card] = await t.repos.listCards(setId);
    await t.repos.setStarred(card.id, true);
    await t.repos.setLearnStage(card.id, 2);
    await t.repos.saveSession(setId, 'learn', { step: 4 });
    await t.repos.saveSrs(card.id, { srs: newSrsCard(7), introducedAt: 7 });
    await t.repos.setSetting('k', 'v');
    const backup = JSON.parse(JSON.stringify(await t.repos.exportBackup()));

    const other = await createTestRepos();
    await other.repos.createSet({ title: 'Will be replaced', description: '' });
    await other.repos.importBackup(backup);

    expect((await other.repos.listSets()).map((set) => set.title)).toEqual(['Spanish']);
    expect(await other.repos.listCards(setId)).toEqual(await t.repos.listCards(setId));
    expect(await other.repos.loadSession(setId, 'learn')).toEqual({ step: 4 });
    expect(await other.repos.listSrs(setId)).toEqual(await t.repos.listSrs(setId));
    expect(await other.repos.getSetting('k')).toBe('v');
    other.close();
  });

  it('rejects a file that is not a Quizr backup and keeps existing data', async () => {
    await seedSet(1);
    await expect(t.repos.importBackup({ hello: 'world' })).rejects.toThrow(/not a Quizr backup/);
    await expect(t.repos.importBackup('nope')).rejects.toThrow();
    expect(await t.repos.listSets()).toHaveLength(1);
  });

  it('rolls back a restore that fails part-way', async () => {
    await seedSet(1);
    const backup = await t.repos.exportBackup();
    // A card pointing at a set that is not in the file breaks a foreign key.
    backup.tables.cards.push({
      id: 'orphan',
      set_id: 'no-such-set',
      term: 'x',
      definition: 'y',
      position: 9,
      starred: 0,
      created_at: 1,
      updated_at: 1,
    });

    await expect(t.repos.importBackup(backup)).rejects.toThrow();
    expect(await t.repos.listSets()).toHaveLength(1);
    expect((await t.repos.listSets())[0].cardCount).toBe(1);
  });
});
