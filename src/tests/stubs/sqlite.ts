/*
 * Tiny in-memory replacement for `@nativescript-community/sqlite`. It understands only the
 * statements `database.ts` issues (CREATE/INSERT OR REPLACE/DELETE/SELECT on three tables),
 * which is enough to drive the real persistence code end to end.
 */
import { vi } from 'vitest';

type Row = Record<string, unknown>;

type SqliteState = { unavailable: boolean; databases: Map<string, FakeDatabase> };
const g = globalThis as unknown as { __sqliteState?: SqliteState };
export const sqliteState: SqliteState = g.__sqliteState ??= {
  /** When set, `openOrCreate` throws, which makes the app fall back to key/value storage. */
  unavailable: false,
  databases: new Map(),
};

export function resetSqlite(): void {
  sqliteState.unavailable = false;
  sqliteState.databases.clear();
  openOrCreate.mockClear();
}

const TABLE_KEYS: Record<string, string> = { transactions: 'id', categories: 'name', recurrences: 'id' };

export class FakeDatabase {
  tables = new Map<string, Row[]>();
  version = 0;
  executed: string[] = [];
  /** When set, the next `execute` rejects with this error. */
  failNextWrite: unknown;

  constructor() {
    for (const table of Object.keys(TABLE_KEYS)) this.tables.set(table, []);
  }

  rows(table: string): Row[] { return this.tables.get(table) ?? []; }

  getVersion(): number { return this.version; }
  async setVersion(version: number): Promise<void> { this.version = version; }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.executed.push(sql);
    if (this.failNextWrite !== undefined) {
      const error = this.failNextWrite;
      this.failNextWrite = undefined;
      throw error;
    }
    const text = sql.replace(/\s+/g, ' ').trim();
    let m: RegExpMatchArray | null;
    if (/^CREATE /i.test(text)) return;
    if ((m = text.match(/^INSERT OR REPLACE INTO (\w+) \(([^)]+)\)/i))) {
      const table = m[1];
      const columns = m[2].split(',').map((c) => c.trim());
      const row: Row = {};
      columns.forEach((column, index) => { row[column] = params[index]; });
      const key = TABLE_KEYS[table];
      const rows = this.rows(table).filter((r) => r[key] !== row[key]);
      rows.push(row);
      this.tables.set(table, rows);
      return;
    }
    if ((m = text.match(/^DELETE FROM (\w+)(?: WHERE (\w+) = \?)?/i))) {
      const table = m[1];
      if (m[2]) this.tables.set(table, this.rows(table).filter((r) => r[m![2]] !== params[0]));
      else this.tables.set(table, []);
      return;
    }
    throw new Error(`Unsupported SQL in fake database: ${sql}`);
  }

  async select(sql: string): Promise<Row[]> {
    const text = sql.replace(/\s+/g, ' ').trim();
    const m = text.match(/^SELECT .* FROM (\w+)(?: ORDER BY (\w+))?/i);
    if (!m) throw new Error(`Unsupported SQL in fake database: ${sql}`);
    const rows = [...this.rows(m[1])];
    if (m[2] && m[2] !== 'rowid') rows.sort((a, b) => Number(a[m[2]]) - Number(b[m[2]]));
    return rows;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> { return work(); }
}

export type SQLiteDatabase = FakeDatabase;

export const openOrCreate = vi.fn((file: string): FakeDatabase => {
  if (sqliteState.unavailable) throw new Error('SQLite native library missing');
  let database = sqliteState.databases.get(file);
  if (!database) sqliteState.databases.set(file, (database = new FakeDatabase()));
  return database;
});
