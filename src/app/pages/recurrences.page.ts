import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';

import { BudgetService } from '../core/budget.service';
import { SettingsService } from '../core/settings.service';
import { endMonth, type Recurrence } from '../domain/recurrence';

@Component({
  selector: 'ns-recurrences',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './recurrences.page.html',
})
export class RecurrencesPage {
  constructor(readonly b: BudgetService, readonly s: SettingsService, readonly router: RouterExtensions) {}

  signed(r: Recurrence): string {
    return `${r.kind === 'income' ? '+' : '-'}${this.s.formatAmount(r.amount)}`;
  }

  details(r: Recurrence): string {
    const t = this.s.t();
    const start = this.s.monthLabel(r.startMonth);
    const end = endMonth(r);
    const range = end !== undefined && r.occurrences !== undefined
      ? t.recurrences.range(start, this.s.monthLabel(end), r.occurrences)
      : t.recurrences.from(start);
    return `${t.frequency[r.frequency]} \u00B7 ${t.recurrences.dayOf(r.day)} \u00B7 ${r.category} \u00B7 ${range}`;
  }

  async remove(r: Recurrence): Promise<void> {
    const t = this.s.t();
    const ok = await Dialogs.confirm({
      title: t.common.delete,
      message: t.recurrences.deleteBody(r.description || t.common.noDescription),
      okButtonText: t.common.delete,
      cancelButtonText: t.common.cancel,
    });
    if (ok) this.b.removeRecurrence(r.id);
  }
}
