import { Component, NO_ERRORS_SCHEMA, ViewContainerRef, computed, inject, linkedSignal } from '@angular/core';
import { ModalDialogParams, ModalDialogService, NativeScriptCommonModule } from '@nativescript/angular';

import { dockToBottom, sheetModalOptions, sheetThemeClass } from '../core/bottom-sheet';
import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { UI_ICONS } from '../domain/icons';
import { currentMonthKey, FIRST_MONTH, LAST_MONTH, monthKeyFrom, yearOf, type MonthKey } from '../domain/month';

/**
 * Month picker shown as a bottom sheet (NativeScript modal): a year selector over a grid of the
 * twelve months. It closes with the chosen month, or with nothing when dismissed.
 */
@Component({
  selector: 'ns-month-picker-modal',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './month-picker-modal.component.html',
})
export class MonthPickerModalComponent {
  private readonly params = inject(ModalDialogParams);
  private readonly current = this.params.context as MonthKey;

  readonly s = inject(SettingsService);
  private readonly b = inject(BudgetService);
  readonly ui = UI_ICONS;
  readonly themeClass = sheetThemeClass();
  readonly dockToBottom = dockToBottom;

  /** Months holding transactions, and the month being edited, as of when the picker opens. */
  private readonly withData = new Set(this.b.monthsWithData());
  private readonly editing = this.b.selectedMonth();

  readonly firstYear = yearOf(FIRST_MONTH);
  readonly lastYear = yearOf(LAST_MONTH);
  readonly year = linkedSignal(() => yearOf(this.current));
  readonly months = computed(() =>
    this.s.t().months.map((label, index) => {
      const key = monthKeyFrom(this.year(), index + 1);
      return { number: index + 1, label, row: Math.floor(index / 3), col: index % 3, class: this.chipClass(key) };
    }));

  /** Selected month first, then the month being edited, then months with data. */
  private chipClass(key: MonthKey): string {
    if (key === this.current) return 'chip chip-active';
    if (key === this.editing) return 'chip chip-editing';
    return this.withData.has(key) ? 'chip chip-data' : 'chip';
  }

  pick(monthNumber: number): void {
    this.params.closeCallback(monthKeyFrom(this.year(), monthNumber));
  }

  pickCurrent(): void {
    this.params.closeCallback(currentMonthKey());
  }
}

/** Opens the month picker sheet on `current`; resolves to the chosen month, or `undefined` if dismissed. */
export async function showMonthPicker(
  modal: ModalDialogService, viewContainerRef: ViewContainerRef, current: MonthKey,
): Promise<MonthKey | undefined> {
  const picked = await modal.showModal(MonthPickerModalComponent, {
    viewContainerRef,
    context: current,
    ...sheetModalOptions(),
  }) as MonthKey | undefined;
  return picked || undefined;
}
