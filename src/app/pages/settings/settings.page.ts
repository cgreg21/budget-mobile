import { Component, NO_ERRORS_SCHEMA, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs, inputType } from '@nativescript/core';
import {
  areThresholdsOrdered, ConfigFileError, describeConfig, isPassphraseAcceptable, type AmountFormat, type AppLanguage,
  type ConfigData, type Currency, type DateFormat, type Theme,
} from 'budget-lib';

import { BudgetService } from '../../core/budget.service';
import { CalendarSyncService } from '../../core/calendar-sync.service';
import { ConfigArchiveService } from '../../core/config-archive.service';
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
  private readonly archive = inject(ConfigArchiveService);
  private readonly router = inject(RouterExtensions);

  readonly low = signal(this.s.formatInput(this.b.thresholds().low));
  readonly medium = signal(this.s.formatInput(this.b.thresholds().medium));
  readonly high = signal(this.s.formatInput(this.b.thresholds().high));
  readonly message = signal('');
  readonly calendarEnabled = signal(this.calendar.config().enabled);
  readonly calendarUrl = signal(this.calendar.config().calendarUrl);
  readonly calendarUsername = signal(this.calendar.config().username);
  readonly calendarInterval = signal(String(this.calendar.config().syncIntervalMinutes ?? 0));
  readonly calendarPassword = signal('');
  readonly passwordPersistent = isCalendarPasswordPersistent();
  readonly configBusy = signal(false);

  /** Passphrase (typed twice) → encrypted file, saved where the user chooses. */
  async exportConfig(): Promise<void> {
    const t = this.s.t();
    const passphrase = await this.askPassphrase(true);
    if (passphrase === null) return;
    this.configBusy.set(true);
    try {
      const saved = await this.archive.exportEncrypted(passphrase);
      await this.alert(saved ? t.config.exported : t.config.cancelled);
    } catch (error) {
      await this.alert(this.describeConfigError(error));
    } finally {
      this.configBusy.set(false);
    }
  }

  /** File → passphrase → summary to confirm → applied; the fields of this page follow. */
  async importConfig(): Promise<void> {
    const t = this.s.t();
    let text: string | null;
    try {
      text = await this.archive.pickFile();
    } catch {
      return this.alert(t.config.readFailed);
    }
    if (text === null) return;
    const passphrase = await this.askPassphrase(false);
    if (passphrase === null) return;
    this.configBusy.set(true);
    try {
      const data = await this.archive.openEncrypted(text, passphrase);
      const confirmed = await Dialogs.confirm({
        title: t.config.importTitle, message: this.configSummary(data),
        okButtonText: t.config.apply, cancelButtonText: t.common.cancel,
      });
      if (!confirmed) return;
      this.archive.apply(data);
      this.refreshFromServices();
      await this.alert(this.s.t().config.imported);
    } catch (error) {
      await this.alert(this.describeConfigError(error));
    } finally {
      this.configBusy.set(false);
    }
  }

  /** What the file holds, for the confirmation before importing. */
  configSummary(data: ConfigData): string {
    const t = this.s.t().config;
    const parts = describeConfig(data);
    const items = [
      parts.calendar ? t.summaryCalendar : '', parts.calendarPassword ? t.summaryCalendarPassword : '',
      parts.bank ? t.summaryBank : '', parts.bankKey ? t.summaryBankKey : '',
    ].filter((item) => item !== '');
    return `${t.summaryIntro}\n${(items.length === 0 ? [t.summaryNone] : items).map((item) => `\u2022 ${item}`).join('\n')}`;
  }

  describeConfigError(error: unknown): string {
    const t = this.s.t().config;
    if (error instanceof ConfigFileError) return t.errors[error.code];
    return t.failed(error instanceof Error ? error.message : String(error));
  }

  /** The passphrase typed in a dialog; asked twice (and checked) on export. Null when cancelled. */
  private async askPassphrase(confirm: boolean): Promise<string | null> {
    const t = this.s.t();
    const ask = async (message: string): Promise<string | null> => {
      const result = await Dialogs.prompt({
        title: t.config.passphraseTitle, message, defaultText: '', inputType: inputType.password,
        okButtonText: t.common.ok, cancelButtonText: t.common.cancel,
      });
      return result.result ? result.text ?? '' : null;
    };
    const first = await ask(t.config.passphrasePrompt);
    if (first === null) return null;
    if (!confirm) return first;
    if (!isPassphraseAcceptable(first)) {
      await this.alert(t.config.tooShort);
      return null;
    }
    const second = await ask(t.config.confirmPrompt);
    if (second === null) return null;
    if (second !== first) {
      await this.alert(t.config.mismatch);
      return null;
    }
    return first;
  }

  private alert(message: string): Promise<void> {
    return Dialogs.alert({ message, okButtonText: this.s.t().common.ok });
  }

  private refreshFromServices(): void {
    this.low.set(this.s.formatInput(this.b.thresholds().low));
    this.medium.set(this.s.formatInput(this.b.thresholds().medium));
    this.high.set(this.s.formatInput(this.b.thresholds().high));
    this.message.set('');
    const config = this.calendar.config();
    this.calendarEnabled.set(config.enabled);
    this.calendarUrl.set(config.calendarUrl);
    this.calendarUsername.set(config.username);
    this.calendarInterval.set(String(config.syncIntervalMinutes ?? 0));
    this.calendarPassword.set('');
  }

  saveCalendar(synchronize = true): void {
    this.calendar.configure({
      enabled: this.calendarEnabled(), calendarUrl: this.calendarUrl(), username: this.calendarUsername(),
      syncIntervalMinutes: Number(this.calendarInterval()),
    }, this.calendarPassword() || null, synchronize);
    this.calendarPassword.set('');
    const config = this.calendar.config();
    this.calendarEnabled.set(config.enabled);
    this.calendarUrl.set(config.calendarUrl);
    this.calendarUsername.set(config.username);
    this.calendarInterval.set(String(config.syncIntervalMinutes ?? 0));
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
