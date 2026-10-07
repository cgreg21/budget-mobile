import { Injectable, computed, signal } from '@angular/core';
import { Application } from '@nativescript/core';

import {
  DEFAULT_GENERAL_SETTINGS,
  isGeneralSettings,
  type AmountFormat,
  type Currency,
  type DateFormat,
  type GeneralSettings,
} from '../domain/general-settings';
import type { MonthKey } from '../domain/month';
import { STRINGS, type Strings } from './i18n';
import { readJson, writeJson } from './storage';

const SETTINGS_KEY = 'general-settings';

const CURRENCY_SYMBOLS: Record<Currency, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', CHF: 'CHF' };

/** General preferences, and every formatter that depends on them. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<GeneralSettings>(
    readJson(SETTINGS_KEY, isGeneralSettings, () => ({ ...DEFAULT_GENERAL_SETTINGS })),
  );
  readonly t = computed<Strings>(() => STRINGS[this.settings().language]);

  constructor() {
    this.applyTheme();
  }

  update(patch: Partial<GeneralSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    writeJson(SETTINGS_KEY, next);
    if (patch.theme !== undefined) this.applyTheme();
  }

  /** Forces the light/dark CSS class on the root view; "system" follows the device. */
  applyTheme(): void {
    const root = Application.getRootView();
    if (!root) return;
    const { theme } = this.settings();
    const resolved = theme === 'system' ? Application.systemAppearance() ?? 'light' : theme;
    root.cssClasses.delete('ns-light');
    root.cssClasses.delete('ns-dark');
    root.cssClasses.add(resolved === 'dark' ? 'ns-dark' : 'ns-light');
    // Re-evaluates the styles of the whole tree, as the core does on appearance changes.
    (root as unknown as { _onCssStateChange(): void })._onCssStateChange();
  }

  monthLabel(month: MonthKey): string {
    return `${this.t().months[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  }

  formatAmount(value: number): string {
    const { language, currency, amountFormat } = this.settings();
    const style: Exclude<AmountFormat, 'locale'> =
      amountFormat === 'locale' ? (language === 'fr' ? 'space-comma' : 'comma-dot') : amountFormat;
    const [integer, decimals] = Math.abs(value).toFixed(2).split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, style === 'space-comma' ? '\u00A0' : ',');
    const number = `${value < 0 ? '-' : ''}${grouped}${style === 'space-comma' ? ',' : '.'}${decimals}`;
    const symbol = CURRENCY_SYMBOLS[currency];
    return style === 'space-comma' ? `${number}\u00A0${symbol}` : `${symbol}${number}`;
  }

  formatDate(iso: string): string {
    const { language, dateFormat } = this.settings();
    const [y, m, d] = iso.split('-');
    const style: Exclude<DateFormat, 'locale'> =
      dateFormat === 'locale' ? (language === 'fr' ? 'dd-mm-yyyy' : 'mm-dd-yyyy') : dateFormat;
    switch (style) {
      case 'dd-mm-yyyy': return `${d}/${m}/${y}`;
      case 'mm-dd-yyyy': return `${m}/${d}/${y}`;
      default: return `${y}-${m}-${d}`;
    }
  }
}
