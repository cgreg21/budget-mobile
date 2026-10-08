import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import {
  MAX_OCCURRENCES, MIN_OCCURRENCES, RECURRENCE_FREQUENCIES, type RecurrenceFrequency,
  type RecurrenceSettings, type TransactionInput, type TransactionKind,
} from 'budget-lib';

import { BudgetService } from '../../../core/budget.service';
import { parseAmount, SettingsService } from '../../../core/settings.service';
import { BottomSheet, sheetBodyHeight } from '../../../shared/bottom-sheet';
import { deleteTransaction } from '../delete-transaction';

/** What the transaction editor is opened with: the transaction to edit, or `null` for a new one. */
export interface EditorContext {
  id: string | null;
}

/** The transaction form. The sheet closes itself once the transaction is saved or deleted. */
@Component({
  selector: 'ns-editor-modal',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './editor-modal.component.html',
})
export class EditorModalComponent extends BottomSheet<EditorContext> {
  readonly s = inject(SettingsService);
  readonly b = inject(BudgetService);
  readonly bodyHeight = sheetBodyHeight(0.6);

  /** The transaction being edited; `undefined` for a new one. */
  readonly existing = this.b.transactions().find((t) => t.id === this.context.id);
  private readonly series = this.existing && this.b.recurrenceOf(this.existing);
  private readonly date = this.existing?.date ?? this.b.defaultTransactionDate;

  readonly kind = signal<TransactionKind>(this.existing?.kind ?? 'expense');
  readonly amount = signal(this.existing ? String(this.existing.amount) : '');
  readonly description = signal(this.existing?.description ?? '');
  readonly category = signal(this.existing?.category ?? this.b.defaultCategory);
  readonly repeat = signal(this.series !== undefined);
  readonly frequency = signal<RecurrenceFrequency>(this.series?.frequency ?? 'monthly');
  readonly limited = signal(this.series?.occurrences !== undefined);
  readonly occurrences = signal(String(this.series?.occurrences ?? 12));
  readonly error = signal('');

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
    const amount = parseAmount(this.amount());
    if (!Number.isFinite(amount) || amount <= 0) {
      this.error.set(t.editor.invalidAmount);
      return;
    }
    this.error.set('');

    const existing = this.existing;
    const input: TransactionInput = {
      date: this.date,
      description: this.description().trim(),
      category: this.category(),
      kind: this.kind(),
      amount,
      recurrenceId: existing?.recurrenceId,
    };
    const settings = this.recurrenceSettings();

    if (!existing) {
      if (settings) this.b.addRecurring(input, settings);
      else this.b.add(input);
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
    if (this.existing && await deleteTransaction(this.b, this.s, this.existing)) this.close();
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
