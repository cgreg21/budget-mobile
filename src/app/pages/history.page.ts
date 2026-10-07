import { Component, NO_ERRORS_SCHEMA, ViewContainerRef, computed, signal } from '@angular/core';
import { ModalDialogService, NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';

import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { clampMonth, monthsBetween, shiftMonth, type MonthKey } from '../domain/month';
import { UI_ICONS } from '../domain/icons';
import { pageTransition } from '../core/page-transition';
import { HeaderComponent } from './header.component';
import { showMonthPicker } from './month-picker-modal.component';
import { MonthlyLinesComponent, type MonthlyTotals } from './monthly-lines.component';

/** Longest interval shown, so the chart stays readable. */
const MAX_MONTHS = 24;
const DEFAULT_MONTHS = 6;

type Bound = 'start' | 'end';

@Component({
  selector: 'ns-history',
  imports: [NativeScriptCommonModule, HeaderComponent, MonthlyLinesComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './history.page.html',
})
export class HistoryPage {
  readonly ui = UI_ICONS;
  readonly end = signal<MonthKey>(this.b.selectedMonth());
  readonly start = signal<MonthKey>(shiftMonth(this.b.selectedMonth(), 1 - DEFAULT_MONTHS));

  /** One entry per month of the interval, empty months included. */
  readonly rows = computed<MonthlyTotals[]>(() => {
    const totals = new Map(this.b.monthlyTotals().map((row) => [row.month, row]));
    const count = monthsBetween(this.start(), this.end()) + 1;
    return Array.from({ length: count }, (_, index) => {
      const month = shiftMonth(this.start(), index);
      return totals.get(month) ?? { month, income: 0, expense: 0 };
    });
  });
  readonly history = computed(() => [...this.rows()].reverse().map((row) => {
    // Each bar is relative to its own month: income and expenses share the whole track.
    const total = row.income + row.expense;
    const income = total > 0 ? Math.round((row.income / total) * 1000) : 0;
    return { ...row, columns: total > 0 ? `${income}*, ${1000 - income}*` : '0*, 0*' };
  }));

  constructor(
    readonly b: BudgetService, readonly s: SettingsService, readonly router: RouterExtensions,
    private readonly modal: ModalDialogService, private readonly viewContainerRef: ViewContainerRef,
  ) {}

  /** Opens the transactions page on the tapped month. */
  open(month: MonthKey): void {
    this.b.selectMonth(month);
    void this.router.navigate(['/budget'], { clearHistory: true, transition: pageTransition('/history', '/budget') });
  }

  /** Asks for the month and applies it to the interval bound being edited. */
  async choose(bound: Bound): Promise<void> {
    const month = await showMonthPicker(this.modal, this.viewContainerRef, bound === 'start' ? this.start() : this.end());
    if (!month) return;
    const picked = clampMonth(month);

    if (bound === 'start') {
      this.start.set(picked);
      if (this.end() < picked) this.end.set(picked);
      else if (monthsBetween(picked, this.end()) >= MAX_MONTHS) this.end.set(shiftMonth(picked, MAX_MONTHS - 1));
    } else {
      this.end.set(picked);
      if (this.start() > picked) this.start.set(picked);
      else if (monthsBetween(this.start(), picked) >= MAX_MONTHS) this.start.set(shiftMonth(picked, 1 - MAX_MONTHS));
    }
  }
}
