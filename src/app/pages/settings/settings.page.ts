import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import {
  areThresholdsOrdered, type AmountFormat, type AppLanguage, type Currency, type DateFormat,
  type Theme,
} from 'budget-lib';

import { BudgetService } from '../../core/budget.service';
import { CalendarSyncService } from '../../core/calendar-sync.service';
import { isCalendarPasswordPersistent } from '../../core/secrets';
import { parseAmount, SettingsService } from '../../core/settings.service';
import { HeaderComponent } from '../../shared/header/header.component';
import { pushTransition } from '../../shared/page-transition';

const LANGUAGES: AppLanguage[] = ['fr', 'en'];
const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'CHF'];
const DATE_FORMATS: DateFormat[] = ['locale', 'dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd'];
const AMOUNT_FORMATS: AmountFormat[] = ['locale', 'space-comma', 'comma-dot'];
const THEMES: Theme[] = ['system', 'light', 'dark'];

@Component({
  selector: 'ns-settings',
  imports: [NativeScriptCommonModule, HeaderComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './settings.page.html',
})
export class SettingsPage {
  readonly b = inject(BudgetService);
  readonly s = inject(SettingsService);
  readonly calendar = inject(CalendarSyncService);
  private readonly router = inject(RouterExtensions);

  readonly low = signal(this.s.formatInput(this.b.thresholds().low));
  readonly medium = signal(this.s.formatInput(this.b.thresholds().medium));
  readonly high = signal(this.s.formatInput(this.b.thresholds().high));
  readonly message = signal('');
  readonly calendarEnabled = signal(this.calendar.config().enabled);
  readonly calendarUrl = signal(this.calendar.config().calendarUrl);
  readonly calendarUsername = signal(this.calendar.config().username);
  readonly calendarPassword = signal('');
  readonly passwordPersistent = isCalendarPasswordPersistent();

  saveCalendar(synchronize = true): void {
    this.calendar.configure({
      enabled: this.calendarEnabled(), calendarUrl: this.calendarUrl(), username: this.calendarUsername(),
    }, this.calendarPassword() || null, synchronize);
    this.calendarPassword.set('');
    const config = this.calendar.config();
    this.calendarEnabled.set(config.enabled);
    this.calendarUrl.set(config.calendarUrl);
    this.calendarUsername.set(config.username);
  }

  testCalendar(): void {
    this.saveCalendar(false);
    void this.calendar.checkConnection();
  }

  syncCalendar(): void {
    this.saveCalendar(false);
    void this.calendar.syncNow();
  }


  openRecurrences(): void {
    void this.router.navigate(['recurrences'], { transition: pushTransition });
  }

  openBank(): void {
    void this.router.navigate(['bank'], { transition: pushTransition });
  }

  languageName(language: AppLanguage): string {
    return language === 'fr' ? 'Fran\u00E7ais' : 'English';
  }

  dateFormatName(format: DateFormat): string {
    return format === 'locale' ? this.s.t().settings.formatLocale : format.toUpperCase();
  }

  amountFormatName(format: AmountFormat): string {
    const names: Record<AmountFormat, string> = {
      locale: this.s.t().settings.formatLocale, 'space-comma': '1 234,56', 'comma-dot': '1,234.56',
    };
    return names[format];
  }

  themeName(theme: Theme): string {
    const { themeSystem, themeLight, themeDark } = this.s.t().settings;
    return { system: themeSystem, light: themeLight, dark: themeDark }[theme];
  }

  pickLanguage(): Promise<void> {
    return this.choose(LANGUAGES, (v) => this.languageName(v), (language) => this.s.update({ language }));
  }

  pickCurrency(): Promise<void> {
    return this.choose(CURRENCIES, (v) => v, (currency) => this.s.update({ currency }));
  }

  pickDateFormat(): Promise<void> {
    return this.choose(DATE_FORMATS, (v) => this.dateFormatName(v), (dateFormat) => this.s.update({ dateFormat }));
  }

  pickAmountFormat(): Promise<void> {
    return this.choose(AMOUNT_FORMATS, (v) => this.amountFormatName(v), (amountFormat) => this.s.update({ amountFormat }));
  }

  pickTheme(): Promise<void> {
    return this.choose(THEMES, (v) => this.themeName(v), (theme) => this.s.update({ theme }));
  }

  saveThresholds(): void {
    const thresholds = {
      low: parseAmount(this.low()),
      medium: parseAmount(this.medium()),
      high: parseAmount(this.high()),
    };
    const valid = Object.values(thresholds).every(Number.isFinite) && areThresholdsOrdered(thresholds);
    if (!valid) {
      this.message.set(this.s.t().settings.thresholdsOrder);
      return;
    }
    this.message.set('');
    this.b.setThresholds(thresholds);
    void Dialogs.alert({ message: this.s.t().settings.thresholdsSaved, okButtonText: this.s.t().common.ok });
  }

  private async choose<T extends string>(values: T[], label: (value: T) => string, apply: (value: T) => void): Promise<void> {
    const t = this.s.t();
    const labels = values.map(label);
    const picked = await Dialogs.action({ title: t.settings.chooseOption, cancelButtonText: t.common.cancel, actions: labels });
    const index = labels.indexOf(picked);
    if (index >= 0) apply(values[index]);
  }
}
