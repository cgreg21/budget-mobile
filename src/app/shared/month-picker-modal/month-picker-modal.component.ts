import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { currentMonthKey, FIRST_MONTH, LAST_MONTH, monthKeyFrom, yearOf, type MonthKey } from 'budget-lib';

import { BudgetService } from '../../core/budget.service';
import { SettingsService } from '../../core/settings.service';
import { UI_ICONS } from '../icons';
import { BottomSheet } from '../bottom-sheet';

/**
 * Month picker: a year selector over a grid of the twelve months. Opened on the selected month,
 * the sheet closes with the chosen one, or with nothing when dismissed.
 */
@Component({
  selector: 'ns-month-picker-modal',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './month-picker-modal.component.html',
})
export class MonthPickerModalComponent extends BottomSheet<MonthKey, MonthKey> {
  readonly s = inject(SettingsService);
  private readonly b = inject(BudgetService);
  readonly ui = UI_ICONS;
  readonly currentMonth = currentMonthKey();

  /** Months holding transactions, and the month being edited, as of when the picker opens. */
  private readonly withData = new Set(this.b.monthsWithData());
  private readonly editing = this.b.selectedMonth();

  readonly firstYear = yearOf(FIRST_MONTH);
  readonly lastYear = yearOf(LAST_MONTH);
  readonly year = signal(yearOf(this.context));
  readonly months = computed(() =>
    this.s.t().months.map((label, index) => {
      const key = monthKeyFrom(this.year(), index + 1);
      return { key, label, row: Math.floor(index / 3), col: index % 3, class: this.chipClass(key) };
    }));

  /** Selected month first, then the month being edited, then months with data. */
  private chipClass(key: MonthKey): string {
    if (key === this.context) return 'chip chip-active';
    if (key === this.editing) return 'chip chip-editing';
    return this.withData.has(key) ? 'chip chip-data' : 'chip';
  }
}
