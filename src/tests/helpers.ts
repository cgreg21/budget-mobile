/* Shared helpers for the specs: a seeded database and component fixtures with an empty template. */
import { NO_ERRORS_SCHEMA, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ModalDialogParams } from '@nativescript/angular';
import { DEFAULT_CATEGORIES, type Category, type Recurrence, type Transaction } from 'budget-lib';
import { beforeEach, vi } from 'vitest';

import { initDatabase, snapshot } from '~/app/core/database';
import { Page } from './stubs/nativescript-core';
import { sqliteState, type FakeDatabase } from './stubs/sqlite';

let db: FakeDatabase | undefined;

/** The in-memory SQLite database behind `~/app/core/database` (the module keeps it across the stub resets). */
export function fakeDatabase(): FakeDatabase {
  if (!db) throw new Error('seedDatabase() has not run yet');
  return db;
}

export interface Seed {
  months?: Record<string, Transaction[]>;
  categories?: Category[];
  recurrences?: Recurrence[];
}

/**
 * Initialises the in-memory database once and resets its snapshot to `seed`. The snapshot is
 * what `BudgetService` reads at construction, so this must run before `TestBed.inject(BudgetService)`.
 */
export async function seedDatabase(seed: Seed = {}): Promise<void> {
  await initDatabase();
  db ??= [...sqliteState.databases.values()][0];
  const snap = snapshot();
  snap.months.clear();
  for (const [month, list] of Object.entries(seed.months ?? {})) snap.months.set(month, [...list]);
  snap.categories = seed.categories ? seed.categories.map((c) => ({ ...c })) : DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  snap.recurrences = (seed.recurrences ?? []).map((r) => ({ ...r }));
}

export const tx = (id: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, date: '2024-03-10', description: `T${id}`, category: 'Alimentation', kind: 'expense', amount: 10, ...extra,
});

export const recurrence = (id: string, extra: Partial<Recurrence> = {}): Recurrence => ({
  id, description: `R${id}`, category: 'Logement', kind: 'expense', amount: 500, day: 5, frequency: 'monthly', startMonth: '2024-01', ...extra,
});

const prepared = new Set<Type<unknown>>();
/** Context and close callback handed to the next sheet (`BottomSheet`) created. */
let sheetParams = new ModalDialogParams({}, () => undefined);
/** The NativeScript `Page` handed to the last page component created. */
let page = new Page();

// The TestBed (and its overrides) is reset before each test by `setup.ts`.
beforeEach(() => {
  prepared.clear();
  sheetParams = new ModalDialogParams({}, () => undefined);
  page = new Page();
});

/**
 * Strips the NativeScript templates of `types` so they can be created under jsdom: the class
 * logic (signals, handlers) is what the specs exercise. Each component also gets its own
 * `ModalDialogParams` (see `openSheetWith`) and `Page`. Must run before anything is injected;
 * `createComponent` does it when the spec has not.
 */
export function prepareComponents(...types: Type<unknown>[]): void {
  for (const type of types) {
    TestBed.overrideComponent(type, {
      set: {
        template: '',
        imports: [],
        schemas: [NO_ERRORS_SCHEMA],
        providers: [
          { provide: ModalDialogParams, useFactory: () => sheetParams },
          { provide: Page, useFactory: () => page },
        ],
      },
    });
    prepared.add(type);
  }
}

/** Sets what the next sheet opens with; returns the spy that receives its result. */
export function openSheetWith(context: unknown): ReturnType<typeof vi.fn> {
  const close = vi.fn();
  sheetParams = new ModalDialogParams(context, close);
  return close;
}

export function currentPage(): Page {
  return page;
}

export function createComponent<T>(
  type: Type<T>,
  options: { inputs?: Record<string, unknown>; detectChanges?: boolean } = {},
): ComponentFixture<T> {
  if (!prepared.has(type)) prepareComponents(type);
  const fixture = TestBed.createComponent(type);
  for (const [name, value] of Object.entries(options.inputs ?? {})) fixture.componentRef.setInput(name, value);
  if (options.detectChanges !== false) fixture.detectChanges();
  return fixture;
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
