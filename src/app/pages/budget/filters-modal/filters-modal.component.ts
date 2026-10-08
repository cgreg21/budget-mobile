import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { isFilterActive, NO_FILTER, type TransactionFilter } from 'budget-lib';

import { BudgetService } from '../../../core/budget.service';
import { SettingsService } from '../../../core/settings.service';
import { categoryGlyph, UI_ICONS } from '../../../shared/icons';
import { BottomSheet } from '../../../shared/bottom-sheet';

/** The transaction filters. The sheet closes with the filter to apply, or with nothing when dismissed. */
@Component({
  selector: 'ns-filters-modal',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './filters-modal.component.html',
})
export class FiltersModalComponent extends BottomSheet<TransactionFilter, TransactionFilter> {
  readonly s = inject(SettingsService);
  private readonly b = inject(BudgetService);
  readonly ui = UI_ICONS;

  readonly filter = signal<TransactionFilter>(this.context);
  readonly hasFilters = computed(() => isFilterActive(this.filter()));
  readonly rows = computed(() => {
    const { categories } = this.filter();
    return this.b.categories().map((c) => ({ name: c.name, icon: categoryGlyph(c.icon), selected: categories.includes(c.name) }));
  });
  readonly categoriesTitle = computed(() => {
    const { categoryFilter } = this.s.t().budget;
    const count = this.filter().categories.length;
    return count === 0 ? categoryFilter : `${categoryFilter} (${count})`;
  });

  patch(change: Partial<TransactionFilter>): void {
    this.filter.update((filter) => ({ ...filter, ...change }));
  }

  toggle(name: string): void {
    const { categories } = this.filter();
    this.patch({ categories: categories.includes(name) ? categories.filter((n) => n !== name) : [...categories, name] });
  }

  reset(): void {
    this.filter.set(NO_FILTER);
  }
}
