import {
  migrationKey,
  planMigrations,
  splitStatements,
  type MigrationBundle,
} from './migrationPlan';

const bundle: MigrationBundle = {
  journal: {
    entries: [
      { idx: 1, when: 200, tag: '0001_second' },
      { idx: 0, when: 100, tag: '0000_first' },
      { idx: 2, when: 300, tag: '0002_third' },
    ],
  },
  migrations: {
    m0000: 'CREATE TABLE a (id text);',
    m0001: 'CREATE TABLE b (id text);\n--> statement-breakpoint\nCREATE INDEX b_id ON b (id);',
    m0002: 'ALTER TABLE a ADD COLUMN title text;',
  },
};

describe('migrationKey', () => {
  it('pads the index to four digits', () => {
    expect(migrationKey(0)).toBe('m0000');
    expect(migrationKey(12)).toBe('m0012');
  });
});

describe('splitStatements', () => {
  it('splits on drizzle breakpoints and drops empty pieces', () => {
    expect(splitStatements('A;\n--> statement-breakpoint\nB;\n--> statement-breakpoint\n')).toEqual(
      ['A;', 'B;'],
    );
  });
});

describe('planMigrations', () => {
  it('plans every migration, in index order, for a new database', () => {
    expect(planMigrations(bundle, null).map((m) => m.tag)).toEqual([
      '0000_first',
      '0001_second',
      '0002_third',
    ]);
  });

  it('plans only migrations newer than the last applied one', () => {
    expect(planMigrations(bundle, 100).map((m) => m.tag)).toEqual(['0001_second', '0002_third']);
    expect(planMigrations(bundle, 300)).toEqual([]);
  });

  it('splits a migration into its statements', () => {
    const [second] = planMigrations(bundle, 100);
    expect(second.statements).toEqual([
      'CREATE TABLE b (id text);',
      'CREATE INDEX b_id ON b (id);',
    ]);
  });

  it('fails loudly when the journal names a migration with no SQL', () => {
    const broken: MigrationBundle = { journal: bundle.journal, migrations: { m0000: 'A;' } };
    expect(() => planMigrations(broken, null)).toThrow(/0001_second/);
  });
});
