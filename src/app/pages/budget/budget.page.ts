import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { GestureStateTypes, Page, type PanGestureEventData, type View } from '@nativescript/core';
import {
  balanceLevel, dayOf, filterTransactions, isFilterActive, NO_FILTER, type Transaction,
  type TransactionFilter,
} from 'budget-lib';

import { BudgetService } from '../../core/budget.service';
import { SettingsService } from '../../core/settings.service';
import { UI_ICONS } from '../../shared/icons';
import { injectSheetOpener } from '../../shared/bottom-sheet';
import { HeaderComponent } from '../../shared/header/header.component';
import { MonthBarComponent } from '../../shared/month-bar/month-bar.component';
import { MonthPickerModalComponent } from '../../shared/month-picker-modal/month-picker-modal.component';
import { TabPager } from '../../shared/tab-pager';
import { deleteTransaction } from './delete-transaction';
import { EditorModalComponent } from './editor-modal/editor-modal.component';
import { FiltersModalComponent } from './filters-modal/filters-modal.component';

/** Width of the delete button revealed by swiping a row, and the move needed to pick a direction. */
const SWIPE_WIDTH = 88;
const SWIPE_SLOP = 10;

const TABS = ['oneoff', 'recurring'] as const;

@Component({
  selector: 'ns-budget',
  imports: [NativeScriptCommonModule, HeaderComponent, MonthBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './budget.page.html',
})
export class BudgetPage {
  readonly b = inject(BudgetService);
  readonly s = inject(SettingsService);
  private readonly openSheet = injectSheetOpener();
  readonly ui = UI_ICONS;
  readonly pager = new TabPager(TABS);

  readonly filter = signal<TransactionFilter>(NO_FILTER);
  readonly hasFilters = computed(() => isFilterActive(this.filter()));
  readonly level = computed(() => balanceLevel(this.b.totals().balance, this.b.thresholds()));
  readonly recurringCount = computed(() => this.b.transactions().filter((t) => t.recurrenceId !== undefined).length);
  readonly oneOffCount = computed(() => this.b.transactions().length - this.recurringCount());
  /** Both tabs are rendered at all times so they can slide against each other. */
  readonly panels = computed(() => {
    const t = this.s.t().budget;
    const filtered = filterTransactions(this.b.sorted(), this.filter());
    return TABS.map((key) => {
      const recurring = key === 'recurring';
      return {
        key,
        items: filtered.filter((transaction) => (transaction.recurrenceId !== undefined) === recurring),
        message: filtered.length > 0 || this.hasFilters() ? t.noMatch : recurring ? t.emptyRecurring : t.emptyOneOff,
      };
    });
  });

  private openRow: View | null = null;
  private swipe: { row: View; origin: number; direction: 'horizontal' | 'vertical' | null } | null = null;

  constructor() {
    this.s.applyTheme();
    // The safe-area strips around the content show the page background: split it so the top
    // matches the header and the bottom matches the tab bar.
    inject(Page).cssClasses.add('tabs-page');
  }

  async openFilters(): Promise<void> {
    const filter = await this.openSheet(FiltersModalComponent, this.filter());
    if (filter) this.filter.set(filter);
  }

  openEditor(id: string | null): void {
    void this.openSheet(EditorModalComponent, { id });
  }

  async chooseMonth(): Promise<void> {
    const month = await this.openSheet(MonthPickerModalComponent, this.b.selectedMonth());
    if (month) this.b.selectMonth(month);
  }

  /** A tap opens the transaction, unless a row is swiped open: then it only closes that row. */
  edit(transaction: Transaction): void {
    if (this.openRow) this.closeOpenRow();
    else this.openEditor(transaction.id);
  }

  deleteFromSwipe(transaction: Transaction): void {
    this.closeOpenRow();
    void deleteTransaction(this.b, this.s, transaction);
  }

  subtitle(transaction: Transaction): string {
    const day = String(dayOf(transaction.date)).padStart(2, '0');
    const recurring = transaction.recurrenceId ? ` \u00B7 \u21BB ${this.s.t().budget.recurringBadge}` : '';
    return `${day} \u00B7 ${transaction.category}${recurring}`;
  }

  /** Swiping a row left reveals its delete button; a vertical move is left to the list scroll. */
  onPan(args: PanGestureEventData): void {
    const row = args.object as View;
    if (args.state === GestureStateTypes.began) {
      if (this.openRow && this.openRow !== row) this.closeOpenRow();
      this.swipe = { row, origin: row.translateX, direction: null };
      return;
    }
    const swipe = this.swipe;
    if (!swipe || swipe.row !== row) return;

    if (args.state === GestureStateTypes.changed) {
      if (swipe.direction === null && Math.max(Math.abs(args.deltaX), Math.abs(args.deltaY)) >= SWIPE_SLOP) {
        swipe.direction = Math.abs(args.deltaX) > Math.abs(args.deltaY) ? 'horizontal' : 'vertical';
      }
      if (swipe.direction === 'horizontal') {
        row.translateX = Math.min(0, Math.max(-SWIPE_WIDTH, swipe.origin + args.deltaX));
      }
      return;
    }

    this.swipe = null;
    if (swipe.direction !== 'horizontal') return;
    const open = row.translateX < -SWIPE_WIDTH / 2;
    row.animate({ translate: { x: open ? -SWIPE_WIDTH : 0, y: 0 }, duration: 150 }).catch(() => undefined);
    this.openRow = open ? row : null;
  }

  private closeOpenRow(): void {
    const row = this.openRow;
    this.openRow = null;
    if (row?.isLoaded) row.animate({ translate: { x: 0, y: 0 }, duration: 150 }).catch(() => undefined);
  }
}
