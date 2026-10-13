import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, type Category, type Recurrence, type Transaction } from 'budget-lib';

import { nsState } from './stubs/nativescript-core';
import { sqliteState } from './stubs/sqlite';

type DatabaseModule = typeof import('~/app/core/database');

const tx = (id: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, date: '2024-03-10', description: `T${id}`, category: 'Food', kind: 'expense', amount: 12.5, ...extra,
});
const recurrence: Recurrence = {
  id: 'r1', description: 'Rent', category: 'Housing', kind: 'expense', amount: 800, day: 1, frequency: 'monthly', startMonth: '2024-01',
};
const categories: Category[] = [{ name: 'Food', icon: 'cart' }, { name: 'Housing', icon: 'home' }];

/** Fresh module instance per test: the database keeps its state in module-level variables. */
async function loadDatabase(): Promise<DatabaseModule> {
  vi.resetModules();
  return import('~/app/core/database');
}

describe('database (SQLite)', () => {
  let database: DatabaseModule;

  beforeEach(async () => {
    database = await loadDatabase();
  });

  it('refuses to serve a snapshot before initialisation', () => {
    expect(() => database.snapshot()).toThrow(/not initialised/);
  });

  it('creates the schema, migrates legacy keys and drops them', async () => {
    nsState.settings.set('month:2024-03', JSON.stringify([tx('a'), tx('b', { recurrenceId: 'r1' })]));
    nsState.settings.set('month:bad-key', JSON.stringify([tx('z')]));
    nsState.settings.set('categories', JSON.stringify(categories));
    nsState.settings.set('recurrences', JSON.stringify([recurrence]));

    await database.initDatabase();

    const snap = database.snapshot();
    expect(snap.months.get('2024-03')).toEqual([tx('a'), tx('b', { recurrenceId: 'r1' })]);
    expect(snap.months.size).toBe(1);
    expect(snap.categories).toEqual(categories);
    expect(snap.recurrences).toEqual([recurrence]);
    expect(nsState.settings.has('month:2024-03')).toBe(false);
    expect(nsState.settings.has('categories')).toBe(false);
    expect(nsState.settings.has('recurrences')).toBe(false);

    const [db] = [...sqliteState.databases.values()];
    expect(db.getVersion()).toBe(1);
    expect(db.executed.filter((s) => s.startsWith('CREATE')).length).toBe(4);
  });

  it('reads the existing database when already at the current version', async () => {
    const other = await loadDatabase();
    await other.initDatabase();
    other.persistMonth('2024-05', [tx('x')]);
    other.persistCategories(categories);
    other.persistRecurrences([recurrence, { ...recurrence, id: 'r2', occurrences: 3 }]);
    await other.flushDatabase();

    database = await loadDatabase();
    await database.initDatabase();
    const snap = database.snapshot();
    expect(snap.months.get('2024-05')).toEqual([tx('x')]);
    expect(snap.categories).toEqual(categories);
    expect(snap.recurrences).toHaveLength(2);
    expect(snap.recurrences[1].occurrences).toBe(3);
    expect(snap.recurrences[0].occurrences).toBeUndefined();
  });

  it('is idempotent', async () => {
    await database.initDatabase();
    await database.initDatabase();
    expect(sqliteState.databases.size).toBe(1);
  });

  it('serialises writes and surfaces failures through flushDatabase', async () => {
    await database.initDatabase();
    const [db] = [...sqliteState.databases.values()];
    database.persistMonth('2024-01', [tx('1')]);
    database.persistMonth('2024-01', [tx('2'), tx('3')]);
    await database.flushDatabase();
    expect(db.rows('transactions').map((r) => r.id)).toEqual(['2', '3']);

    db.failNextWrite = new Error('disk full');
    database.persistCategories(categories);
    await expect(database.flushDatabase()).rejects.toThrow('disk full');
  });

  it('upgrades emoji category icons on load', async () => {
    nsState.settings.set('categories', JSON.stringify([{ name: 'Food', icon: '\u{1F354}' }]));
    await database.initDatabase();
    const [category] = database.snapshot().categories;
    expect(category.icon).not.toBe('\u{1F354}');
    await database.flushDatabase();
    const [db] = [...sqliteState.databases.values()];
    expect(db.rows('categories')[0].icon).toBe(category.icon);
  });

  it('uses the default categories when none are stored', async () => {
    await database.initDatabase();
    expect(database.snapshot().categories.map((c) => c.name)).toEqual(DEFAULT_CATEGORIES.map((c) => c.name));
  });
});

describe('database (key/value fallback)', () => {
  let database: DatabaseModule;

  beforeEach(async () => {
    sqliteState.unavailable = true;
    database = await loadDatabase();
  });

  it('reads legacy keys and keeps writing to them', async () => {
    nsState.settings.set('month:2024-03', JSON.stringify([tx('a')]));
    await database.initDatabase();
    expect(database.snapshot().months.get('2024-03')).toEqual([tx('a')]);
    expect(nsState.settings.has('month:2024-03')).toBe(true);

    database.persistMonth('2024-04', [tx('b')]);
    database.persistMonth('2024-03', []);
    database.persistCategories(categories);
    database.persistRecurrences([recurrence]);
    await database.flushDatabase();

    expect(JSON.parse(nsState.settings.get('month:2024-04')!)).toEqual([tx('b')]);
    expect(nsState.settings.has('month:2024-03')).toBe(false);
    expect(JSON.parse(nsState.settings.get('categories')!)).toEqual(categories);
    expect(JSON.parse(nsState.settings.get('recurrences')!)).toEqual([recurrence]);
  });

  it('converts legacy string categories', async () => {
    nsState.settings.set('categories', JSON.stringify(['Food', 'Housing']));
    await database.initDatabase();
    expect(database.snapshot().categories.map((c) => c.name)).toEqual(['Food', 'Housing']);
  });
});
