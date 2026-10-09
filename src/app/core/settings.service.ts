import { Injectable, computed, signal } from '@angular/core';
import { Application } from '@nativescript/core';
import {
  DEFAULT_GENERAL_SETTINGS, isGeneralSettings, type AmountFormat, type Currency, type DateFormat,
  type GeneralSettings, type MonthKey, type TransactionKind,
} from 'budget-lib';

import { STRINGS, type Strings } from './i18n';
import { readJson, writeJson } from './storage';

const SETTINGS_KEY = 'general-settings';

// The mobile design is dark first; the library defaults to the system theme.
const DEFAULT_SETTINGS: GeneralSettings = { ...DEFAULT_GENERAL_SETTINGS, theme: 'dark' };

const CURRENCY_SYMBOLS: Record<Currency, string> = { EUR: '\u20AC', USD: '$', GBP: '\u00A3', CHF: 'CHF' };

/** Whether the light theme is on (see `SettingsService.applyTheme`). */
export function isLightTheme(): boolean {
  return Application.getRootView()?.cssClasses.has('ns-light') ?? false;
}

/**
 * Reads an amount typed with a comma or a dot as decimal separator, with or without grouping
 * spaces ("1 234,56", "1,234.56"); NaN when it is not a number.
 */
export function parseAmount(text: string): number {
  const clean = text.replace(/[\s\u00A0\u202F]/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const group = decimal === ',' ? /\./g : /,/g;
    return Number(clean.replace(group, '').replace(decimal, '.'));
  }
  return Number(clean.replace(',', '.'));
}

/** General preferences, and every formatter that depends on them. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<GeneralSettings>(
    readJson(SETTINGS_KEY, isGeneralSettings, () => ({ ...DEFAULT_SETTINGS })),
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
    const { currency } = this.settings();
    const style = this.amountStyle();
    const [integer, decimals] = Math.abs(value).toFixed(2).split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, style === 'space-comma' ? '\u00A0' : ',');
    const number = `${value < 0 ? '-' : ''}${grouped}${style === 'space-comma' ? ',' : '.'}${decimals}`;
    const symbol = CURRENCY_SYMBOLS[currency];
    return style === 'space-comma' ? `${number}\u00A0${symbol}` : `${symbol}${number}`;
  }

  /** The decimal separator of the chosen amount format: what an amount field should show and expect. */
  get decimalSeparator(): string {
    return this.amountStyle() === 'space-comma' ? ',' : '.';
  }

  /** A number as it is shown in an edit field: two decimals, the format's separator, no grouping. */
  formatInput(value: number): string {
    return value.toFixed(2).replace('.', this.decimalSeparator);
  }

  /** Tidies what was typed in an amount field; text that is not a number is left for the user to fix. */
  normalizeInput(text: string): string {
    if (text.trim() === '') return '';
    const value = parseAmount(text);
    return Number.isFinite(value) ? this.formatInput(value) : text;
  }

  private amountStyle(): Exclude<AmountFormat, 'locale'> {
    const { language, amountFormat } = this.settings();
    return amountFormat === 'locale' ? (language === 'fr' ? 'space-comma' : 'comma-dot') : amountFormat;
  }

  /** The amount preceded by the sign of its kind: + for an income, - for an expense. */
  formatSigned(kind: TransactionKind, amount: number): string {
    return `${kind === 'income' ? '+' : '-'}${this.formatAmount(amount)}`;
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
