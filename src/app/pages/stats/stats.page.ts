import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { Page } from '@nativescript/core';
import {
  buildPieSlices, clampMonth, sumByCategory, type MonthKey, type PieSlice, type Transaction,
} from 'budget-lib';

import { BudgetService } from '../../core/budget.service';
import { SettingsService } from '../../core/settings.service';
import { UI_ICONS } from '../../shared/icons';
import { injectSheetOpener } from '../../shared/bottom-sheet';
import { HeaderComponent } from '../../shared/header/header.component';
import { MonthBarComponent } from '../../shared/month-bar/month-bar.component';
import { MonthPickerModalComponent } from '../../shared/month-picker-modal/month-picker-modal.component';
import { PressDirective } from '../../shared/motion';
import { TabPager } from '../../shared/tab-pager';
import { CategoryPieComponent } from './category-pie/category-pie.component';

@Component({
  selector: 'ns-stats',
  imports: [NativeScriptCommonModule, CategoryPieComponent, HeaderComponent, MonthBarComponent, PressDirective],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './stats.page.html',
})
export class StatsPage {
  readonly b = inject(BudgetService);
  readonly s = inject(SettingsService);
  private readonly openSheet = injectSheetOpener();
  readonly ui = UI_ICONS;
  readonly pager = new TabPager(['all', 'recurring'] as const);

  /** Starts on the month being edited; browsing here leaves the budget page's month alone. */
  readonly month = signal<MonthKey>(this.b.selectedMonth());
  readonly transactions = computed(() => {
    const month = this.month();
    return month === this.b.selectedMonth() ? this.b.transactions() : this.b.transactionsOf(month);
  });
  readonly expenseSlices = computed(() => this.slices(this.transactions()));
  readonly recurringSlices = computed(() => this.slices(this.transactions().filter((t) => t.recurrenceId !== undefined)));

  constructor() {
    inject(Page).cssClasses.add('tabs-page');
  }

  async chooseMonth(): Promise<void> {
    const month = await this.openSheet(MonthPickerModalComponent, this.month());
    if (month) this.month.set(clampMonth(month));
  }

  /** The expenses per category, as pie slices. */
  private slices(transactions: Transaction[]): PieSlice[] {
    return buildPieSlices(sumByCategory(transactions, 'expense').map(({ category, amount }) => ({
      label: category,
      icon: this.b.categoryGlyph(category),
      amount,
    })));
  }
}
