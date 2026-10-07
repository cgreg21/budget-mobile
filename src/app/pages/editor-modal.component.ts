import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { ModalDialogParams, NativeScriptCommonModule } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';

import { dockToBottom, sheetBodyHeight, sheetThemeClass } from '../core/bottom-sheet';
import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { categoryIcon } from '../domain/category';
import { categoryGlyph } from '../domain/category-icons';
import {
  MAX_OCCURRENCES, MIN_OCCURRENCES, RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency, type RecurrenceSettings,
} from '../domain/recurrence';
import type { Transaction, TransactionInput, TransactionKind } from '../domain/transaction';

/** What the transaction editor modal is opened with: the transaction to edit, or `null` for a new one. */
export interface EditorContext {
  id: string | null;
}

/**
 * The transaction form, shown as a bottom sheet (ModalDialogService).
 * It closes itself once the transaction is saved or deleted.
 */
@Component({
  selector: 'ns-editor-modal',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './editor-modal.component.html',
})
export class EditorModalComponent {
  private readonly params = inject(ModalDialogParams);
  readonly s = inject(SettingsService);
  readonly b = inject(BudgetService);

  readonly themeClass = sheetThemeClass();
  readonly bodyHeight = sheetBodyHeight(0.6);
  readonly dockToBottom = dockToBottom;

  readonly existing = signal<Transaction | null>(null);
  readonly kind = signal<TransactionKind>('expense');
  readonly amount = signal('');
  readonly description = signal('');
  readonly category = signal('');
  readonly date = signal('');
  readonly repeat = signal(false);
  readonly frequency = signal<RecurrenceFrequency>('monthly');
  readonly limited = signal(false);
  readonly occurrences = signal('12');
  readonly error = signal('');

  readonly categoryGlyph = computed(() => categoryGlyph(categoryIcon(this.b.categories(), this.category())));

  constructor() {
    const id = (this.params.context as EditorContext).id;
    const found = id ? this.b.transactions().find((t) => t.id === id) : undefined;

    if (found) {
      this.existing.set(found);
      this.kind.set(found.kind);
      this.amount.set(String(found.amount));
      this.description.set(found.description);
      this.category.set(found.category);
      this.date.set(found.date);
      const series = this.b.recurrenceOf(found);
      if (series) {
        this.repeat.set(true);
        this.frequency.set(series.frequency);
        this.limited.set(series.occurrences !== undefined);
        if (series.occurrences !== undefined) this.occurrences.set(String(series.occurrences));
      }
    } else {
      this.category.set(this.b.defaultCategory);
      this.date.set(this.b.defaultTransactionDate);
    }
  }

  chip(active: boolean): string {
    return active ? 'chip chip-active' : 'chip';
  }

  close(): void {
    this.params.closeCallback();
  }

  async pickCategory(): Promise<void> {
    const t = this.s.t();
    const picked = await Dialogs.action({
      title: t.editor.category,
      cancelButtonText: t.common.cancel,
      actions: this.b.categories().map((c) => c.name),
    });
    if (picked !== t.common.cancel) this.category.set(picked);
  }

  async pickFrequency(): Promise<void> {
    const t = this.s.t();
    const labels = RECURRENCE_FREQUENCIES.map((f) => t.frequency[f]);
    const picked = await Dialogs.action({
      title: t.editor.frequency,
      cancelButtonText: t.common.cancel,
      actions: labels,
    });
    const index = labels.indexOf(picked);
    if (index >= 0) this.frequency.set(RECURRENCE_FREQUENCIES[index]);
  }

  async save(): Promise<void> {
    const t = this.s.t();
    const amount = Number(this.amount().replace(',', '.').trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      this.error.set(t.editor.invalidAmount);
      return;
    }
    this.error.set('');

    const existing = this.existing();
    const input: TransactionInput = {
      date: this.date(),
      description: this.description().trim(),
      category: this.category(),
      kind: this.kind(),
      amount,
      recurrenceId: existing?.recurrenceId,
    };
    const settings = this.recurrenceSettings();

    if (!existing) {
      if (settings) this.b.addRecurring({ ...input, recurrenceId: undefined }, settings);
      else this.b.add({ ...input, recurrenceId: undefined });
    } else if (this.b.recurrenceOf(existing)) {
      const choice = await Dialogs.action({
        title: t.editor.scopeTitle,
        message: t.editor.scopeBody,
        cancelButtonText: t.common.cancel,
        actions: [t.editor.occurrenceOnly, t.editor.seriesToo],
      });
      if (choice === t.editor.occurrenceOnly) this.b.update(existing.id, input);
      else if (choice === t.editor.seriesToo) this.b.updateSeries(existing.id, input, settings);
      else return;
    } else if (settings) {
      this.b.updateSeries(existing.id, input, settings);
    } else {
      this.b.update(existing.id, input);
    }
    this.close();
  }

  async remove(): Promise<void> {
    const existing = this.existing();
    if (!existing) return;
    const t = this.s.t();

    if (existing.recurrenceId && this.b.recurrenceOf(existing)) {
      const choice = await Dialogs.action({
        title: t.budget.deleteTitle,
        message: t.budget.deleteScopeBody,
        cancelButtonText: t.common.cancel,
        actions: [t.budget.thisOccurrence, t.budget.wholeSeries],
      });
      if (choice === t.budget.thisOccurrence) this.b.remove(existing.id);
      else if (choice === t.budget.wholeSeries) this.b.removeSeries(existing.id, existing.recurrenceId);
      else return;
    } else {
      const ok = await Dialogs.confirm({
        title: t.budget.deleteTitle,
        message: t.budget.deleteBody(existing.description || t.common.noDescription),
        okButtonText: t.common.delete,
        cancelButtonText: t.common.cancel,
      });
      if (!ok) return;
      this.b.remove(existing.id);
    }
    this.close();
  }

  private recurrenceSettings(): RecurrenceSettings | null {
    if (!this.repeat()) return null;
    if (!this.limited()) return { frequency: this.frequency() };
    const count = Math.round(Number(this.occurrences()));
    const bounded = Number.isFinite(count)
      ? Math.min(Math.max(count, MIN_OCCURRENCES), MAX_OCCURRENCES)
      : MIN_OCCURRENCES;
    return { frequency: this.frequency(), occurrences: bounded };
  }
}
