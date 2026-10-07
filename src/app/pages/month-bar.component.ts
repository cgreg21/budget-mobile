import { Component, NO_ERRORS_SCHEMA, inject, input, output } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';

import { SettingsService } from '../core/settings.service';
import { UI_ICONS } from '../domain/icons';
import { FIRST_MONTH, LAST_MONTH, monthKeyFrom, monthNumberOf, shiftMonth, yearOf, type MonthKey } from '../domain/month';

/** Previous/next month and year buttons around the month label, which opens the month picker. */
@Component({
  selector: 'ns-month-bar',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './month-bar.component.html',
})
export class MonthBarComponent {
  readonly s = inject(SettingsService);
  readonly ui = UI_ICONS;

  readonly month = input.required<MonthKey>();
  readonly monthChange = output<MonthKey>();
  readonly labelTap = output<void>();

  hasOlder(): boolean {
    return this.month() > FIRST_MONTH;
  }

  hasNewer(): boolean {
    return this.month() < LAST_MONTH;
  }

  shift(delta: number): void {
    this.monthChange.emit(shiftMonth(this.month(), delta));
  }

  shiftYear(delta: number): void {
    const month = this.month();
    this.monthChange.emit(monthKeyFrom(yearOf(month) + delta, monthNumberOf(month)));
  }
}
