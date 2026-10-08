import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { endMonth, type Recurrence } from 'budget-lib';

import { BudgetService } from '../../../core/budget.service';
import { SettingsService } from '../../../core/settings.service';
import { ListReveal } from '../../../shared/list-reveal';
import { AppearDirective } from '../../../shared/motion';

@Component({
  selector: 'ns-recurrences',
  imports: [NativeScriptCommonModule, AppearDirective],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './recurrences.page.html',
})
export class RecurrencesPage {
  readonly b = inject(BudgetService);
  readonly s = inject(SettingsService);
  readonly router = inject(RouterExtensions);
  readonly reveal = new ListReveal();

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
