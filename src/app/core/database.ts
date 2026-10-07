import { knownFolders, path } from '@nativescript/core';
import { openOrCreate, type SQLiteDatabase } from '@nativescript-community/sqlite';

import { DEFAULT_CATEGORIES, fromLegacyCategories, isCategoryList, isLegacyCategoryList, type Category } from '../domain/category';
import { normalizeCategoryIcons } from '../domain/category-icons';
import { isMonthKey, type MonthKey } from '../domain/month';
import { isRecurrenceList, type Recurrence } from '../domain/recurrence';
import { isTransactionArray, type Transaction } from '../domain/transaction';
import { allKeys, readJson, removeKey, writeJson } from './storage';

/** Everything the budget persists, as loaded at startup. */
export interface StoreSnapshot {
  months: Map<MonthKey, Transaction[]>;
  categories: Category[];
  recurrences: Recurrence[];
}

const DB_FILE = 'budget.db';
const SCHEMA_VERSION = 1;

const LEGACY_MONTH_PREFIX = 'month:';
const LEGACY_CATEGORIES_KEY = 'categories';
const LEGACY_RECURRENCES_KEY = 'recurrences';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS transactions (
     id TEXT PRIMARY KEY NOT NULL,
     month TEXT NOT NULL,
     date TEXT NOT NULL,
     description TEXT NOT NULL,
     category TEXT NOT NULL,
     kind TEXT NOT NULL,
     amount REAL NOT NULL,
     recurrence_id TEXT
   )`,
  'CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions (month)',
  `CREATE TABLE IF NOT EXISTS categories (
     name TEXT PRIMARY KEY NOT NULL,
     icon TEXT NOT NULL,
     position INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS recurrences (
     id TEXT PRIMARY KEY NOT NULL,
     description TEXT NOT NULL,
     category TEXT NOT NULL,
     kind TEXT NOT NULL,
     amount REAL NOT NULL,
     day INTEGER NOT NULL,
     frequency TEXT NOT NULL,
     start_month TEXT NOT NULL,
     occurrences INTEGER
   )`,
];

let db: SQLiteDatabase | null = null;
let loaded: StoreSnapshot | null = null;
// Writes are applied one after the other, in the order they were requested.
let queue: Promise<unknown> = Promise.resolve();

function enqueue(job: (database: SQLiteDatabase) => Promise<unknown>): void {
  queue = queue
    .then(() => job(db as SQLiteDatabase))
    .catch((error) => console.error('SQLite write failed', error));
}

const insertTransaction = (database: SQLiteDatabase, month: MonthKey, t: Transaction): Promise<void> =>
  database.execute(
    'INSERT OR REPLACE INTO transactions (id, month, date, description, category, kind, amount, recurrence_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [t.id, month, t.date, t.description, t.category, t.kind, t.amount, t.recurrenceId ?? null],
  );

const insertCategory = (database: SQLiteDatabase, c: Category, position: number): Promise<void> =>
  database.execute('INSERT OR REPLACE INTO categories (name, icon, position) VALUES (?, ?, ?)', [c.name, c.icon, position]);

const insertRecurrence = (database: SQLiteDatabase, r: Recurrence): Promise<void> =>
  database.execute(
    'INSERT OR REPLACE INTO recurrences (id, description, category, kind, amount, day, frequency, start_month, occurrences) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [r.id, r.description, r.category, r.kind, r.amount, r.day, r.frequency, r.startMonth, r.occurrences ?? null],
  );

const legacyMonthKey = (month: MonthKey): string => `${LEGACY_MONTH_PREFIX}${month}`;

/** Reads the data kept in the old key/value storage (also the storage used when SQLite is unavailable). */
function readLegacySnapshot(): StoreSnapshot {
  const months = new Map<MonthKey, Transaction[]>();
  for (const key of allKeys().filter((k) => k.startsWith(LEGACY_MONTH_PREFIX))) {
    const month = key.slice(LEGACY_MONTH_PREFIX.length);
    if (!isMonthKey(month)) continue;
    const list = readJson(key, isTransactionArray, () => []);
    if (list.length > 0) months.set(month, list);
  }
  const rawCategories = readJson<unknown>(LEGACY_CATEGORIES_KEY, (v): v is unknown => true, () => null);
  const categories = isCategoryList(rawCategories)
    ? rawCategories
    : isLegacyCategoryList(rawCategories)
      ? fromLegacyCategories(rawCategories)
      : DEFAULT_CATEGORIES.map((category) => ({ ...category }));
  const recurrences = readJson(LEGACY_RECURRENCES_KEY, isRecurrenceList, () => []);
  return { months, categories, recurrences };
}

/** Moves the data kept in the old key/value storage into SQLite, then drops the old keys. */
async function migrateLegacyData(database: SQLiteDatabase): Promise<void> {
  const { months, categories, recurrences } = readLegacySnapshot();

  await database.transaction(async () => {
    for (const [month, list] of months) {
      for (const transaction of list) await insertTransaction(database, month, transaction);
    }
    for (const [position, category] of categories.entries()) await insertCategory(database, category, position);
    for (const recurrence of recurrences) await insertRecurrence(database, recurrence);
  });

  for (const month of months.keys()) removeKey(legacyMonthKey(month));
  removeKey(LEGACY_CATEGORIES_KEY);
  removeKey(LEGACY_RECURRENCES_KEY);
}

async function readSnapshot(database: SQLiteDatabase): Promise<StoreSnapshot> {
  const months = new Map<MonthKey, Transaction[]>();
  for (const row of await database.select('SELECT * FROM transactions ORDER BY rowid')) {
    const transaction: Transaction = {
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      kind: row.kind,
      amount: Number(row.amount),
      ...(row.recurrence_id === null ? {} : { recurrenceId: row.recurrence_id }),
    };
    const list = months.get(row.month);
    if (list) list.push(transaction);
    else months.set(row.month, [transaction]);
  }

  const categories: Category[] = (await database.select('SELECT name, icon FROM categories ORDER BY position'))
    .map((row) => ({ name: row.name, icon: row.icon }));

  const recurrences: Recurrence[] = (await database.select('SELECT * FROM recurrences')).map((row) => ({
    id: row.id,
    description: row.description,
    category: row.category,
    kind: row.kind,
    amount: Number(row.amount),
    day: Number(row.day),
    frequency: row.frequency,
    startMonth: row.start_month,
    ...(row.occurrences === null ? {} : { occurrences: Number(row.occurrences) }),
  }));

  return { months, categories, recurrences };
}

/**
 * Opens (and creates / migrates) the database; must complete before the first screen is built.
 * When the native SQLite library is not part of the running app (e.g. a preview client, or a
 * build made before the plugin was added), the data stays in the key/value storage instead.
 */
export async function initDatabase(): Promise<void> {
  if (loaded) return;
  try {
    const database = openOrCreate(path.join(knownFolders.documents().path, DB_FILE));
    for (const statement of SCHEMA) await database.execute(statement);

    if (database.getVersion() < SCHEMA_VERSION) {
      await migrateLegacyData(database);
      await database.setVersion(SCHEMA_VERSION);
    }

    db = database;
    loaded = await readSnapshot(database);
  } catch (error) {
    console.warn('SQLite is unavailable, falling back to key/value storage:', error);
    db = null;
    loaded = readLegacySnapshot();
  }

  // Categories saved with emoji icons are upgraded to the shared symbolic names.
  const upgraded = normalizeCategoryIcons(loaded.categories);
  if (upgraded.some((category, index) => category.icon !== loaded?.categories[index].icon)) {
    loaded.categories = upgraded;
    persistCategories(upgraded);
  }
}

export function snapshot(): StoreSnapshot {
  if (!loaded) throw new Error('The database is not initialised.');
  return loaded;
}

/** Replaces every transaction filed under `month`. */
export function persistMonth(month: MonthKey, list: readonly Transaction[]): void {
  if (!db) {
    if (list.length === 0) removeKey(legacyMonthKey(month));
    else writeJson(legacyMonthKey(month), list);
    return;
  }
  enqueue((database) => database.transaction(async () => {
    await database.execute('DELETE FROM transactions WHERE month = ?', [month]);
    for (const transaction of list) await insertTransaction(database, month, transaction);
  }));
}

export function persistCategories(list: readonly Category[]): void {
  if (!db) {
    writeJson(LEGACY_CATEGORIES_KEY, list);
    return;
  }
  enqueue((database) => database.transaction(async () => {
    await database.execute('DELETE FROM categories');
    for (const [position, category] of list.entries()) await insertCategory(database, category, position);
  }));
}

export function persistRecurrences(list: readonly Recurrence[]): void {
  if (!db) {
    writeJson(LEGACY_RECURRENCES_KEY, list);
    return;
  }
  enqueue((database) => database.transaction(async () => {
    await database.execute('DELETE FROM recurrences');
    for (const recurrence of list) await insertRecurrence(database, recurrence);
  }));
}
