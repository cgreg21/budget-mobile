import { TestBed } from '@angular/core/testing';
import { DEFAULT_BALANCE_THRESHOLDS, DEFAULT_CATEGORY_ICON, transactionHash, type Transaction } from 'budget-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetService } from '~/app/core/budget.service';
import { flushDatabase } from '~/app/core/database';
import { glyph } from '~/app/shared/icons';
import { fakeDatabase, recurrence, seedDatabase, tx } from './helpers';
import { nsState } from './stubs/nativescript-core';

const NOW = new Date('2024-03-15T12:00:00');

describe('BudgetService', () => {
  const create = (): BudgetService => {
    TestBed.resetTestingModule();
    return TestBed.inject(BudgetService);
  };

  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('months and transactions', () => {
    let b: BudgetService;

    beforeEach(async () => {
      await seedDatabase({ months: { '2024-03': [tx('a'), tx('b', { date: '2024-03-01', amount: 50, kind: 'income' })], '2024-01': [tx('old', { date: '2024-01-05' })] } });
      b = create();
    });

    it('opens the current month with its totals and sorted list', () => {
      expect(b.selectedMonth()).toBe('2024-03');
      expect(b.sorted().map((t) => t.id)).toEqual(['a', 'b']);
      expect(b.totals()).toEqual({ income: 50, expense: 10, balance: 40 });
      expect(b.defaultTransactionDate).toBe('2024-03-15');
      expect(b.defaultCategory).toBe('Autres');
      expect(b.categoryGlyph('Alimentation')).toBe(glyph('food'));
      expect(b.categoryGlyph('Unknown')).toBe(glyph('folder'));
      expect(b.thresholds()).toEqual(DEFAULT_BALANCE_THRESHOLDS);
    });

    it('uses the first category when the fallback one is missing', async () => {
      await seedDatabase({ categories: [{ name: 'Only', icon: 'x' }] });
      expect(create().defaultCategory).toBe('Only');
    });

    it('selects valid months only, clamped', () => {
      b.selectMonth('nope');
      expect(b.selectedMonth()).toBe('2024-03');
      b.selectMonth('2024-01');
      expect(b.transactions().map((t) => t.id)).toEqual(['old']);
      b.selectMonth('2024-01');
      b.selectMonth('2200-01');
      expect(b.selectedMonth()).toBe('2099-12');
      expect(b.transactions()).toEqual([]);
    });

    it('adds a transaction under the month of its date and notifies', async () => {
      const changes = vi.fn();
      b.transactionsChanged.subscribe(changes);
      b.add({ date: '2024-02-10', description: 'Feb', category: 'Autres', kind: 'expense', amount: 3 });
      expect(b.selectedMonth()).toBe('2024-02');
      expect(b.transactions()).toHaveLength(1);
      expect(b.transactions()[0].id).toMatch(/^[0-9a-z]+$/);
      expect(changes).toHaveBeenCalledTimes(1);
      await flushDatabase();
      expect(fakeDatabase().rows('transactions').some((r) => r.month === '2024-02')).toBe(true);
    });

    it('updates in place, or moves a transaction to another month', () => {
      b.update('a', { date: '2024-03-20', description: 'Edited', category: 'Autres', kind: 'expense', amount: 7 });
      expect(b.transactions().find((t) => t.id === 'a')).toEqual({ id: 'a', date: '2024-03-20', description: 'Edited', category: 'Autres', kind: 'expense', amount: 7 });

      b.update('a', { date: '2024-04-02', description: 'Moved', category: 'Autres', kind: 'expense', amount: 7 });
      expect(b.selectedMonth()).toBe('2024-04');
      expect(b.transactions().map((t) => t.id)).toEqual(['a']);
      expect(b.transactionsOf('2024-03').map((t) => t.id)).toEqual(['b']);
      b.update('ghost', { date: '2024-05-02', description: 'x', category: 'Autres', kind: 'expense', amount: 1 });
      expect(b.transactions().map((t) => t.id)).toEqual(['ghost']);
    });

    it('removes transactions and drops empty months', () => {
      b.remove('a');
      b.remove('b');
      b.remove('missing');
      expect(b.transactions()).toEqual([]);
      expect(b.monthsWithData()).toEqual(['2024-01']);
      expect(b.monthlyTotals()).toEqual([{ month: '2024-01', income: 0, expense: 10 }]);
      expect(b.allTransactions().map((t) => t.id)).toEqual(['old']);
    });

    it('stores thresholds in the settings', () => {
      b.setThresholds({ low: 1, medium: 2, high: 3 });
      expect(b.thresholds()).toEqual({ low: 1, medium: 2, high: 3 });
      expect(JSON.parse(nsState.settings.get('thresholds')!)).toEqual({ low: 1, medium: 2, high: 3 });
      expect(create().thresholds()).toEqual({ low: 1, medium: 2, high: 3 });
    });

    it('imports external transactions, skipping known ids', () => {
      const added = b.importTransactions([
        tx('a'), tx('n1', { date: '2024-03-02' }), tx('n2', { date: '2023-12-25' }),
      ]);
      expect(added).toBe(2);
      expect(b.transactions().map((t) => t.id)).toEqual(['a', 'n1', 'b']);
      expect(b.transactionsOf('2023-12').map((t) => t.id)).toEqual(['n2']);
      expect(b.importTransactions([tx('a')])).toBe(0);
    });
  });

  describe('categories', () => {
    let b: BudgetService;

    beforeEach(async () => {
      await seedDatabase({ categories: [{ name: 'A', icon: 'x' }, { name: 'B', icon: 'y' }] });
      b = create();
    });

    it('adds, updates and removes categories but never the last one', async () => {
      b.addCategory('C', 'z');
      b.updateCategory('A', { name: 'AA' });
      b.updateCategory('B', { icon: 'yy' });
      expect(b.categories()).toEqual([{ name: 'AA', icon: 'x' }, { name: 'B', icon: 'yy' }, { name: 'C', icon: 'z' }]);
      b.removeCategory('AA');
      b.removeCategory('B');
      b.removeCategory('C');
      expect(b.categories()).toEqual([{ name: 'C', icon: 'z' }]);
      await flushDatabase();
      expect(fakeDatabase().rows('categories').map((r) => r.name)).toEqual(['C']);
    });
  });

  describe('recurrences', () => {
    const input = { date: '2024-03-05', description: 'Rent', category: 'Logement', kind: 'expense' as const, amount: 500 };

    beforeEach(async () => {
      await seedDatabase();
    });

    it('materialises missing occurrences when a month is opened', () => {
      nsState.settings.clear();
      const b = create();
      expect(b.transactions()).toEqual([]);
      b.addRecurring(input, { frequency: 'monthly' });
      expect(b.transactions()).toHaveLength(1);
      expect(b.recurrences()).toHaveLength(1);
      const created = b.recurrences()[0];
      expect(created).toMatchObject({ description: 'Rent', day: 5, frequency: 'monthly', startMonth: '2024-03' });
      expect(b.recurrenceOf(b.transactions()[0])).toBe(created);
      expect(b.recurrenceOf(tx('x'))).toBeUndefined();

      b.selectMonth('2024-05');
      expect(b.transactions()).toHaveLength(1);
      expect(b.transactions()[0]).toMatchObject({ date: '2024-05-05', recurrenceId: created.id });
      b.selectMonth('2024-01');
      expect(b.transactions()).toHaveLength(0);
    });

    it('does not bring back an occurrence deleted from a month', async () => {
      const b = create();
      b.addRecurring(input, { frequency: 'monthly', occurrences: 3 });
      b.selectMonth('2024-04');
      const [occurrence] = b.transactions();
      b.remove(occurrence.id);
      expect(b.transactions()).toEqual([]);
      b.selectMonth('2024-03');
      b.selectMonth('2024-04');
      expect(b.transactions()).toEqual([]);
      expect(JSON.parse(nsState.settings.get('recurrence-skipped')!)).toEqual([JSON.stringify([b.recurrences()[0].id, '2024-04'])]);

      // The skip list is reloaded with the service.
      await seedDatabase({ recurrences: [b.recurrences()[0]] });
      const again = create();
      again.selectMonth('2024-04');
      expect(again.transactions()).toEqual([]);
      again.selectMonth('2024-06');
      expect(again.transactions()).toEqual([]);
      again.selectMonth('2024-05');
      expect(again.transactions()).toHaveLength(1);
    });

    it('turns an occurrence into a one-off, edits the series or starts a new one', () => {
      const b = create();
      b.addRecurring(input, { frequency: 'monthly' });
      const [occurrence] = b.transactions();
      const seriesId = occurrence.recurrenceId!;

      b.updateSeries(occurrence.id, { ...input, amount: 600, recurrenceId: seriesId }, { frequency: 'quarterly', occurrences: 4 });
      expect(b.recurrences()[0]).toMatchObject({ id: seriesId, amount: 600, frequency: 'quarterly', occurrences: 4, day: 5, startMonth: '2024-03' });
      expect(b.transactions()[0].amount).toBe(600);

      b.updateSeries(occurrence.id, { ...input, recurrenceId: seriesId }, null);
      expect(b.recurrences()).toEqual([]);
      expect(b.transactions()[0].recurrenceId).toBeUndefined();

      b.updateSeries(occurrence.id, { ...input, description: 'New series' }, { frequency: 'yearly' });
      expect(b.recurrences()).toHaveLength(1);
      expect(b.transactions()[0].recurrenceId).toBe(b.recurrences()[0].id);

      b.updateSeries(occurrence.id, { ...input, recurrenceId: 'unknown' }, null);
      expect(b.recurrences()).toHaveLength(1);
    });

    it('removes a series with its occurrence, or the template alone', () => {
      const b = create();
      b.addRecurring(input, { frequency: 'monthly' });
      const [occurrence] = b.transactions();
      b.selectMonth('2024-04');
      b.selectMonth('2024-03');
      b.removeSeries(occurrence.id, occurrence.recurrenceId!);
      expect(b.recurrences()).toEqual([]);
      expect(b.transactions()).toEqual([]);
      expect(b.transactionsOf('2024-04')).toHaveLength(1);

      b.addRecurring(input, { frequency: 'monthly' });
      b.removeRecurrence(b.recurrences()[0].id);
      expect(b.recurrences()).toEqual([]);
      b.removeRecurrence('nothing');
    });
  });

  describe('applyCalendarChanges', () => {
    let b: BudgetService;
    let sent: Transaction[];

    beforeEach(async () => {
      await seedDatabase({ months: { '2024-03': [tx('a'), tx('b'), tx('c', { recurrenceId: 'r1' })] }, recurrences: [recurrence('r1', { startMonth: '2024-04' })] });
      b = create();
      sent = b.allTransactions();
    });

    it('applies upserts, moves, deletions and new categories to unchanged transactions only', () => {
      const changes = vi.fn();
      b.transactionsChanged.subscribe(changes);
      b.update('b', { ...tx('b'), amount: 99 });
      changes.mockClear();

      b.applyCalendarChanges(
        [
          { ...tx('a'), amount: 20, category: 'Imported' },
          { ...tx('b'), amount: 1 },
          { ...tx('c'), date: '2024-04-10', recurrenceId: 'r1' },
          tx('new', { date: '2024-02-01' }),
        ],
        ['b', 'missing'],
        sent,
      );

      expect(b.transactions().map((t) => [t.id, t.amount])).toEqual([['b', 99], ['a', 20]]);
      expect(b.transactionsOf('2024-04').map((t) => t.id)).toEqual(['c']);
      expect(b.transactionsOf('2024-02').map((t) => t.id)).toEqual(['new']);
      expect(b.categories().at(-1)).toEqual({ name: 'Imported', icon: DEFAULT_CATEGORY_ICON });
      expect(JSON.parse(nsState.settings.get('recurrence-skipped')!)).toEqual([JSON.stringify(['r1', '2024-03'])]);
      expect(changes).not.toHaveBeenCalled();
    });

    it('deletes unchanged transactions and stamps recurring ones', () => {
      b.applyCalendarChanges([], ['a', 'c'], sent);
      expect(b.transactions().map((t) => t.id)).toEqual(['b']);
      expect(nsState.settings.get('recurrence-skipped')).toContain('r1');
    });

    it('keeps the recurrence stamp when only the amount changes', () => {
      b.applyCalendarChanges([{ ...tx('c', { recurrenceId: 'r1' }), amount: 2 }], [], sent);
      expect(b.transactions().find((t) => t.id === 'c')).toMatchObject({ amount: 2, recurrenceId: 'r1' });
      expect(nsState.settings.has('recurrence-skipped')).toBe(false);
    });

    it('matches transactions by hash', () => {
      expect(transactionHash(sent[0])).toBe(transactionHash(tx('a')));
    });
  });
});
