import { Injectable, computed, signal } from '@angular/core';

import { FALLBACK_CATEGORY, type Category } from '../domain/category';
import { DEFAULT_BALANCE_THRESHOLDS, isBalanceThresholds, type BalanceThresholds } from '../domain/balance';
import {
  clampMonth, currentMonthKey, defaultDateInMonth, FIRST_MONTH, isMonthKey, LAST_MONTH,
  monthKeyOf, shiftMonth, type MonthKey,
} from '../domain/month';
import {
  missingOccurrences, recurrenceFromTransaction, sortRecurrences,
  type Recurrence, type RecurrenceSettings,
} from '../domain/recurrence';
import {
  computeTotals, sortByDateDesc, type Transaction, type TransactionInput,
} from '../domain/transaction';
import { persistCategories, persistMonth, persistRecurrences, snapshot } from './database';
import { notifyLocalChange } from './change-feed';
import { createId, readJson, writeJson } from './storage';
import { monthFilePath } from '../domain/remote';

// Thresholds are configuration, not data: they stay in the key/value settings.
const THRESHOLDS_KEY = 'thresholds';

/**
 * The budget as a history of months, stored in SQLite and mirrored in memory
 * (see core/database.ts); the selected month is exposed as signals. Same rules as the desktop BudgetStore -
 * recurrences are materialised when a month is opened, idempotently.
 */
@Injectable({ providedIn: 'root' })
export class BudgetService {
  readonly selectedMonth = signal<MonthKey>(currentMonthKey());
  readonly transactions = signal<Transaction[]>([]);
  private readonly months = snapshot().months;
  readonly categories = signal<Category[]>(snapshot().categories);
  readonly recurrences = signal<Recurrence[]>(sortRecurrences(snapshot().recurrences));
  readonly thresholds = signal<BalanceThresholds>(
    readJson(THRESHOLDS_KEY, isBalanceThresholds, () => ({ ...DEFAULT_BALANCE_THRESHOLDS })),
  );

  readonly sorted = computed(() => sortByDateDesc(this.transactions()));
  readonly totals = computed(() => computeTotals(this.transactions()));
  readonly hasOlderMonth = computed(() => this.selectedMonth() > FIRST_MONTH);
  readonly hasNewerMonth = computed(() => this.selectedMonth() < LAST_MONTH);

  constructor() {
    this.openMonth(this.selectedMonth());
  }

  get currentMonth(): MonthKey {
    return currentMonthKey();
  }

  get defaultTransactionDate(): string {
    return defaultDateInMonth(this.selectedMonth());
  }

  selectMonth(month: MonthKey): void {
    if (!isMonthKey(month)) return;
    const next = clampMonth(month);
    if (next === this.selectedMonth()) return;
    this.openMonth(next);
  }

  selectOlderMonth(): void {
    this.selectMonth(shiftMonth(this.selectedMonth(), -1));
  }

  selectNewerMonth(): void {
    this.selectMonth(shiftMonth(this.selectedMonth(), 1));
  }

  /** Files the transaction under the month of its date, and shows that month. */
  add(input: TransactionInput): void {
    this.selectMonth(monthKeyOf(input.date));
    this.saveMonth([...this.transactions(), { id: createId(), ...input }]);
  }

  addRecurring(input: TransactionInput, settings: RecurrenceSettings): void {
    const recurrence: Recurrence = { id: createId(), ...recurrenceFromTransaction(input, settings) };
    // Stamped before the series is published so the month is not filled twice.
    this.add({ ...input, recurrenceId: recurrence.id });
    this.saveRecurrences([...this.recurrences(), recurrence]);
  }

  recurrenceOf(transaction: Transaction): Recurrence | undefined {
    const id = transaction.recurrenceId;
    return id === undefined ? undefined : this.recurrences().find((r) => r.id === id);
  }

  update(id: string, input: TransactionInput): void {
    const month = this.selectedMonth();
    if (monthKeyOf(input.date) !== month) {
      // The date left the month on screen: the transaction moves with it.
      this.saveMonth(this.transactions().filter((t) => t.id !== id));
      this.selectMonth(monthKeyOf(input.date));
      this.saveMonth([...this.transactions(), { id, ...input }]);
      return;
    }
    this.saveMonth(this.transactions().map((t) => (t.id === id ? { id, ...input } : t)));
  }

  /** Applies an edit to the whole series; `null` settings turns it into a one-off transaction. */
  updateSeries(id: string, input: TransactionInput, settings: RecurrenceSettings | null): void {
    const current = this.recurrences().find((r) => r.id === input.recurrenceId);

    if (settings === null) {
      if (current) this.saveRecurrences(this.recurrences().filter((r) => r.id !== current.id));
      this.update(id, { ...input, recurrenceId: undefined });
      return;
    }

    const next = recurrenceFromTransaction(input, settings);
    if (current) {
      this.update(id, input);
      // Day and start month belong to the series, not to the occurrence edited.
      this.saveRecurrences(this.recurrences().map((r) =>
        r.id === current.id ? { id: current.id, ...next, day: current.day, startMonth: current.startMonth } : r));
      return;
    }

    const recurrence: Recurrence = { id: createId(), ...next };
    this.update(id, { ...input, recurrenceId: recurrence.id });
    this.saveRecurrences([...this.recurrences(), recurrence]);
  }

  remove(id: string): void {
    this.saveMonth(this.transactions().filter((t) => t.id !== id));
  }

  /** Drops the template and this occurrence; occurrences in other months stay. */
  removeSeries(id: string, recurrenceId: string): void {
    this.saveRecurrences(this.recurrences().filter((r) => r.id !== recurrenceId));
    this.remove(id);
  }

  removeRecurrence(id: string): void {
    this.saveRecurrences(this.recurrences().filter((r) => r.id !== id));
  }

  /** Totals for every month holding transactions, oldest first. */
  monthlyTotals(): { month: MonthKey; income: number; expense: number }[] {
    return [...this.months.keys()].sort().flatMap((month) => {
      const list = this.months.get(month) ?? [];
      if (list.length === 0) return [];
      const { income, expense } = computeTotals(list);
      return [{ month, income, expense }];
    });
  }

  setThresholds(thresholds: BalanceThresholds): void {
    this.replaceThresholds(thresholds);
    notifyLocalChange('thresholds.json');
  }

  /*
   * Replication API: applies data coming from the remote copy, without
   * flagging it as a local change (so it is not sent back).
   */

  /** Months holding at least one transaction. */
  monthsWithData(): MonthKey[] {
    return [...this.months.keys()].filter((month) => (this.months.get(month)?.length ?? 0) > 0).sort();
  }

  transactionsOf(month: MonthKey): Transaction[] {
    return this.months.get(month) ?? [];
  }

  replaceMonth(month: MonthKey, list: Transaction[]): void {
    if (list.length === 0) this.months.delete(month);
    else this.months.set(month, list);
    persistMonth(month, list);
    if (month === this.selectedMonth()) this.transactions.set(list);
  }

  replaceThresholds(thresholds: BalanceThresholds): void {
    this.thresholds.set(thresholds);
    writeJson(THRESHOLDS_KEY, thresholds);
  }

  replaceCategories(list: Category[]): void {
    persistCategories(list);
    this.categories.set(list);
  }

  replaceRecurrences(list: Recurrence[]): void {
    const sorted = sortRecurrences(list);
    persistRecurrences(sorted);
    this.recurrences.set(sorted);
    this.applyRecurrences();
  }

  addCategory(name: string, icon: string): void {
    this.saveCategories([...this.categories(), { name, icon }]);
  }

  updateCategory(name: string, patch: Partial<Category>): void {
    this.saveCategories(this.categories().map((c) => (c.name === name ? { ...c, ...patch } : c)));
  }

  removeCategory(name: string): void {
    const next = this.categories().filter((c) => c.name !== name);
    if (next.length > 0) this.saveCategories(next);
  }

  /** Name used when a new transaction has no category picked yet. */
  get defaultCategory(): string {
    const list = this.categories();
    return list.find((c) => c.name === FALLBACK_CATEGORY)?.name ?? list[0].name;
  }

  private openMonth(month: MonthKey): void {
    this.selectedMonth.set(month);
    this.transactions.set(this.months.get(month) ?? []);
    this.applyRecurrences();
  }

  /** Writes the occurrences the selected month still lacks; stamped ones are left alone. */
  private applyRecurrences(): void {
    const month = this.selectedMonth();
    const missing = missingOccurrences(this.recurrences(), month, this.transactions());
    if (missing.length === 0) return;
    this.saveMonth([...this.transactions(), ...missing.map((input) => ({ id: createId(), ...input }))]);
  }

  private saveMonth(list: Transaction[]): void {
    const month = this.selectedMonth();
    this.replaceMonth(month, list);
    this.transactions.set(list);
    notifyLocalChange(monthFilePath(month));
  }

  private saveRecurrences(list: Recurrence[]): void {
    this.replaceRecurrences(list);
    notifyLocalChange('recurrences.json');
  }

  private saveCategories(list: Category[]): void {
    this.replaceCategories(list);
    notifyLocalChange('categories.json');
  }
}
