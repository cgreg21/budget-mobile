import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { ModalDialogParams, NativeScriptCommonModule } from '@nativescript/angular';

import { dockToBottom, sheetThemeClass } from '../core/bottom-sheet';
import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { categoryGlyph } from '../domain/category-icons';
import { UI_ICONS } from '../domain/icons';
import type { TransactionKind } from '../domain/transaction';

export interface TransactionFilters {
  search: string;
  kind: TransactionKind | null;
  /** Empty means every category. */
  categories: string[];
}

/**
 * The transaction filters, shown as a NativeScript modal (ModalDialogService).
 * It closes with the filters to apply, or with nothing when dismissed.
 */
@Component({
  selector: 'ns-filters-modal',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './filters-modal.component.html',
})
export class FiltersModalComponent {
  private readonly params = inject(ModalDialogParams);
  private readonly initial = this.params.context as TransactionFilters;

  readonly s = inject(SettingsService);
  private readonly b = inject(BudgetService);
  readonly ui = UI_ICONS;

  readonly search = signal(this.initial.search);
  readonly kind = signal<TransactionKind | null>(this.initial.kind);
  readonly selected = signal<string[]>([...this.initial.categories]);
  readonly hasFilters = computed(() => this.search() !== '' || this.kind() !== null || this.selected().length > 0);
  readonly rows = computed(() => {
    const selected = new Set(this.selected());
    return this.b.categories().map((c) => ({ name: c.name, icon: categoryGlyph(c.icon), selected: selected.has(c.name) }));
  });
  readonly categoriesTitle = computed(() => {
    const { categoryFilter } = this.s.t().budget;
    return this.selected().length === 0 ? categoryFilter : `${categoryFilter} (${this.selected().length})`;
  });

  readonly themeClass = sheetThemeClass();

  readonly dockToBottom = dockToBottom;

  chip(active: boolean): string {
    return active ? 'chip chip-active' : 'chip';
  }

  toggle(name: string): void {
    this.selected.update((names) => (names.includes(name) ? names.filter((n) => n !== name) : [...names, name]));
  }

  reset(): void {
    this.search.set('');
    this.kind.set(null);
    this.selected.set([]);
  }

  apply(): void {
    const filters: TransactionFilters = { search: this.search(), kind: this.kind(), categories: this.selected() };
    this.params.closeCallback(filters);
  }
}
