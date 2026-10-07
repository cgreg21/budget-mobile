import { Component, NO_ERRORS_SCHEMA, ViewContainerRef, computed, signal } from '@angular/core';
import { ModalDialogService, NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Page } from '@nativescript/core';

import { BudgetService } from '../core/budget.service';
import { TabPager } from '../core/tab-pager';
import { SettingsService } from '../core/settings.service';
import { categoryIcon } from '../domain/category';
import { UI_ICONS } from '../domain/icons';
import { clampMonth, type MonthKey } from '../domain/month';
import { buildPieSlices, type PieSlice } from '../domain/pie-chart';
import { categoryGlyph } from '../domain/category-icons';
import { sumByCategory, type Transaction } from '../domain/transaction';
import { CategoryPieComponent } from './category-pie.component';
import { HeaderComponent } from './header.component';
import { MonthBarComponent } from './month-bar.component';
import { showMonthPicker } from './month-picker-modal.component';

@Component({
  selector: 'ns-stats',
  imports: [NativeScriptCommonModule, CategoryPieComponent, HeaderComponent, MonthBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './stats.page.html',
})
export class StatsPage {
  readonly ui = UI_ICONS;
  readonly pager = new TabPager();
  readonly tab = signal<'all' | 'recurring'>('all');
  /** Starts on the month being edited; browsing here leaves the budget page's month alone. */
  readonly month = signal<MonthKey>(this.b.selectedMonth());
  readonly transactions = computed(() => {
    const month = this.month();
    return month === this.b.selectedMonth() ? this.b.transactions() : this.b.transactionsOf(month);
  });
  readonly expenseSlices = computed(() => this.slices(this.transactions(), 'expense'));
  readonly recurringSlices = computed(() =>
    this.slices(this.transactions().filter((t) => t.recurrenceId !== undefined), 'expense'));

  constructor(
    readonly b: BudgetService, readonly s: SettingsService, readonly router: RouterExtensions, page: Page,
    private readonly modal: ModalDialogService, private readonly viewContainerRef: ViewContainerRef,
  ) {
    page.cssClasses.add('tabs-page');
  }

  async chooseMonth(): Promise<void> {
    const month = await showMonthPicker(this.modal, this.viewContainerRef, this.month());
    if (month) this.month.set(clampMonth(month));
  }

  selectTab(next: 'all' | 'recurring'): void {
    if (next === this.tab()) return;
    if (this.pager.show(next === 'recurring' ? 1 : 0)) this.tab.set(next);
  }

  tabClass(tab: 'all' | 'recurring'): string {
    return this.tab() === tab ? 'tab tab-active' : 'tab';
  }

  private slices(transactions: Transaction[], kind: 'income' | 'expense'): PieSlice[] {
    return buildPieSlices(
      sumByCategory(transactions, kind).map(({ category, amount }) => ({
        label: category,
        icon: categoryGlyph(categoryIcon(this.b.categories(), category)),
        amount,
      })),
    );
  }
}
