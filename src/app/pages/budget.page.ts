import { Component, NO_ERRORS_SCHEMA, ViewContainerRef, computed, signal } from '@angular/core';
import { ModalDialogService, NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs, GestureStateTypes, Page, type PanGestureEventData, type View } from '@nativescript/core';

import { sheetModalOptions } from '../core/bottom-sheet';
import { TabPager } from '../core/tab-pager';
import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { balanceLevel } from '../domain/balance';
import { categoryIcon } from '../domain/category';
import { categoryGlyph } from '../domain/category-icons';
import { UI_ICONS } from '../domain/icons';
import { dayOf } from '../domain/month';
import {
  filterTransactions, type Transaction, type TransactionKind,
} from '../domain/transaction';
import { EditorModalComponent, type EditorContext } from './editor-modal.component';
import { FiltersModalComponent, type TransactionFilters } from './filters-modal.component';
import { HeaderComponent } from './header.component';
import { MonthBarComponent } from './month-bar.component';
import { showMonthPicker } from './month-picker-modal.component';

/** Width of the delete button revealed by swiping a row, and the move needed to pick a direction. */
const SWIPE_WIDTH = 88;
const SWIPE_SLOP = 10;

@Component({
  selector: 'ns-budget',
  imports: [NativeScriptCommonModule, HeaderComponent, MonthBarComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './budget.page.html',
})
export class BudgetPage {
  private openRow: View | null = null;
  readonly pager = new TabPager();
  private swipe: { row: View; origin: number; direction: 'horizontal' | 'vertical' | null } | null = null;
  readonly search = signal('');
  readonly kind = signal<TransactionKind | null>(null);
  readonly categories = signal<string[]>([]);

  readonly filtered = computed(() => filterTransactions(this.b.sorted(), {
    search: this.search(),
    kind: this.kind(),
    categories: this.categories(),
  }));
  readonly hasFilters = computed(() => this.search() !== '' || this.kind() !== null || this.categories().length > 0);
  readonly tab = signal<'oneoff' | 'recurring'>('oneoff');
  readonly recurringCount = computed(() => this.b.transactions().filter((t) => t.recurrenceId !== undefined).length);
  readonly oneOffCount = computed(() => this.b.transactions().length - this.recurringCount());
  /** Both tabs are rendered at all times so they can slide against each other. */
  readonly panels = computed(() => {
    const t = this.s.t().budget;
    const all = this.filtered();
    return (['oneoff', 'recurring'] as const).map((key) => {
      const recurring = key === 'recurring';
      return {
        key,
        items: all.filter((transaction) => (transaction.recurrenceId !== undefined) === recurring),
        message: all.length > 0 || this.hasFilters() ? t.noMatch : recurring ? t.emptyRecurring : t.emptyOneOff,
      };
    });
  });
  readonly level = computed(() => balanceLevel(this.b.totals().balance, this.b.thresholds()));
  readonly ui = UI_ICONS;

  constructor(
    readonly b: BudgetService, readonly s: SettingsService,
    private readonly router: RouterExtensions,
    private readonly modal: ModalDialogService,
    private readonly viewContainerRef: ViewContainerRef,
    page: Page,
  ) {
    this.s.applyTheme();
    // The safe-area strips around the content show the page background: split it so the top
    // matches the header and the bottom matches the tab bar.
    page.cssClasses.add('tabs-page');
  }

  async openFilters(): Promise<void> {
    const current: TransactionFilters = { search: this.search(), kind: this.kind(), categories: this.categories() };
    const result = await this.modal.showModal(FiltersModalComponent, {
      viewContainerRef: this.viewContainerRef,
      context: current,
      ...sheetModalOptions(),
    }) as TransactionFilters | undefined;
    if (!result) return;
    this.search.set(result.search);
    this.kind.set(result.kind);
    this.categories.set(result.categories);
  }

  async openEditor(id: string | null): Promise<void> {
    await this.modal.showModal(EditorModalComponent, {
      viewContainerRef: this.viewContainerRef,
      context: { id } satisfies EditorContext,
      ...sheetModalOptions(),
    });
  }

  go(page: string, id?: string): void {
    this.router.navigate(id === undefined ? [page] : [page, id]);
  }

  edit(transaction: Transaction): void {
    if (this.openRow) {
      this.closeOpenRow();
      return;
    }
    void this.openEditor(transaction.id);
  }

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

  deleteFromSwipe(transaction: Transaction): void {
    this.closeOpenRow();
    void this.confirmDelete(transaction);
  }

  chip(active: boolean): string {
    return active ? 'chip chip-active' : 'chip';
  }

  selectTab(next: 'oneoff' | 'recurring'): void {
    if (next === this.tab()) return;
    if (this.pager.show(next === 'recurring' ? 1 : 0)) this.tab.set(next);
  }

  tabClass(tab: 'oneoff' | 'recurring'): string {
    return this.tab() === tab ? 'tab tab-active' : 'tab';
  }

  async chooseMonth(): Promise<void> {
    const month = await showMonthPicker(this.modal, this.viewContainerRef, this.b.selectedMonth());
    if (month) this.b.selectMonth(month);
  }

  icon(transaction: Transaction): string {
    return categoryGlyph(categoryIcon(this.b.categories(), transaction.category));
  }

  subtitle(transaction: Transaction): string {
    const day = String(dayOf(transaction.date)).padStart(2, '0');
    const recurring = transaction.recurrenceId ? ` \u00B7 \u21BB ${this.s.t().budget.recurringBadge}` : '';
    return `${day} \u00B7 ${transaction.category}${recurring}`;
  }

  signed(transaction: Transaction): string {
    const sign = transaction.kind === 'income' ? '+' : '-';
    return `${sign}${this.s.formatAmount(transaction.amount)}`;
  }

  async confirmDelete(transaction: Transaction): Promise<void> {
    const t = this.s.t();
    const details = `${transaction.description || t.common.noDescription} (${this.signed(transaction)})`;

    if (transaction.recurrenceId && this.b.recurrenceOf(transaction)) {
      const choice = await Dialogs.action({
        title: t.budget.deleteTitle,
        message: t.budget.deleteScopeBody,
        cancelButtonText: t.common.cancel,
        actions: [t.budget.thisOccurrence, t.budget.wholeSeries],
      });
      if (choice === t.budget.thisOccurrence) this.b.remove(transaction.id);
      else if (choice === t.budget.wholeSeries) this.b.removeSeries(transaction.id, transaction.recurrenceId);
      return;
    }

    const ok = await Dialogs.confirm({
      title: t.budget.deleteTitle,
      message: t.budget.deleteBody(details),
      okButtonText: t.common.delete,
      cancelButtonText: t.common.cancel,
    });
    if (ok) this.b.remove(transaction.id);
  }
}
