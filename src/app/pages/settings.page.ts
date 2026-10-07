import { Component, NO_ERRORS_SCHEMA, computed, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';

import { BudgetService } from '../core/budget.service';
import { isICloudSupported } from '../core/icloud';
import { isPasswordPersistent } from '../core/secrets';
import { SettingsService } from '../core/settings.service';
import { SyncService } from '../core/sync.service';
import { pushTransition } from '../core/page-transition';
import { areThresholdsOrdered } from '../domain/balance';
import type {
  AmountFormat, AppLanguage, Currency, DateFormat, Theme,
} from '../domain/general-settings';
import type { RemoteProvider } from '../domain/remote';
import { HeaderComponent } from './header.component';

const LANGUAGES: AppLanguage[] = ['fr', 'en'];
const CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'CHF'];
const DATE_FORMATS: DateFormat[] = ['locale', 'dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd'];
const AMOUNT_FORMATS: AmountFormat[] = ['locale', 'space-comma', 'comma-dot'];
const THEMES: Theme[] = ['system', 'light', 'dark'];

const parseAmount = (text: string): number => Number(text.replace(',', '.').trim());

@Component({
  selector: 'ns-settings',
  imports: [NativeScriptCommonModule, HeaderComponent],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './settings.page.html',
})
export class SettingsPage {
  readonly low = signal(String(this.b.thresholds().low));
  readonly medium = signal(String(this.b.thresholds().medium));
  readonly high = signal(String(this.b.thresholds().high));
  readonly message = signal('');
  readonly syncEnabled = signal(this.sync.config().enabled);
  readonly syncProvider = signal<RemoteProvider>(this.sync.config().provider);
  readonly icloudSupported = isICloudSupported();
  readonly syncUrl = signal(this.sync.config().baseUrl);
  readonly syncUser = signal(this.sync.config().username);
  readonly syncDir = signal(this.sync.config().remoteDir);
  readonly syncPassword = signal('');
  readonly passwordPersistent = isPasswordPersistent();
  readonly syncStatusText = computed(() => {
    const { sync: strings } = this.s.t();
    const { state, pending, lastSyncedAt } = this.sync.status();
    const labels = {
      disabled: strings.stateDisabled, connecting: strings.stateConnecting, syncing: strings.stateSyncing,
      online: strings.stateOnline, offline: strings.stateOffline, error: strings.stateError,
    };
    const parts = [labels[state]];
    if (pending > 0) parts.push(strings.pending(pending));
    parts.push(strings.lastSync(lastSyncedAt ? this.formatDateTime(lastSyncedAt) : strings.never));
    return parts.join(' \u00B7 ');
  });

  constructor(
    readonly b: BudgetService, readonly s: SettingsService, readonly sync: SyncService,
    readonly router: RouterExtensions,
  ) {}

  openRecurrences(): void {
    void this.router.navigate(['recurrences'], { transition: pushTransition });
  }

  private formatDateTime(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return `${this.s.formatDate(day)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  saveSync(): void {
    this.sync.configure(
      {
        provider: this.syncProvider(), baseUrl: this.syncUrl(), username: this.syncUser(),
        remoteDir: this.syncDir(), enabled: this.syncEnabled(),
      },
      this.syncPassword() === '' ? null : this.syncPassword(),
    );
    this.syncPassword.set('');
    const config = this.sync.config();
    this.syncUrl.set(config.baseUrl);
    this.syncUser.set(config.username);
    this.syncDir.set(config.remoteDir);
    this.syncEnabled.set(config.enabled);
  }

  providerName(provider: RemoteProvider): string {
    const { providerWebdav, providerIcloud } = this.s.t().sync;
    return provider === 'icloud' ? providerIcloud : providerWebdav;
  }

  pickProvider(): Promise<void> {
    const providers: RemoteProvider[] = ['webdav', 'icloud'];
    return this.choose(providers, (v) => this.providerName(v), (provider) => this.syncProvider.set(provider));
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
