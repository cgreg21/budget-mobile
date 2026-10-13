import { TestBed } from '@angular/core/testing';
import { DEFAULT_GENERAL_SETTINGS } from 'budget-lib';
import { beforeEach, describe, expect, it } from 'vitest';

import { SettingsService, isLightTheme, parseAmount } from '~/app/core/settings.service';
import { makeRootView, nsState } from './stubs/nativescript-core';

describe('parseAmount', () => {
  it.each([
    ['12', 12], ['12,5', 12.5], ['12.5', 12.5], ['1 234,56', 1234.56], ['1\u00A0234,56', 1234.56],
    ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['abc', NaN], ['', 0],
  ])('parses %j', (text, expected) => {
    const value = parseAmount(text);
    if (Number.isNaN(expected)) expect(value).toBeNaN();
    else expect(value).toBe(expected);
  });
});

describe('isLightTheme', () => {
  it('is false without a root view and follows the root CSS class', () => {
    expect(isLightTheme()).toBe(false);
    nsState.rootView = makeRootView();
    expect(isLightTheme()).toBe(false);
    nsState.rootView.cssClasses.add('ns-light');
    expect(isLightTheme()).toBe(true);
  });
});

describe('SettingsService', () => {
  let service: SettingsService;

  const create = (): SettingsService => {
    TestBed.resetTestingModule();
    return TestBed.inject(SettingsService);
  };

  beforeEach(() => {
    nsState.rootView = makeRootView();
    nsState.settings.set('general-settings', JSON.stringify({ ...DEFAULT_GENERAL_SETTINGS, theme: 'dark', language: 'fr' }));
    service = create();
  });

  it('starts dark and applies the theme class on the root view', () => {
    expect(service.settings().theme).toBe('dark');
    expect(service.settings().language).toBe('fr');
    expect(nsState.rootView!.cssClasses.has('ns-dark')).toBe(true);
    expect(nsState.rootView!._onCssStateChange).toHaveBeenCalled();
  });

  it('defaults to a dark theme and the library defaults when nothing is stored', () => {
    nsState.settings.clear();
    const fresh = create();
    expect(fresh.settings()).toEqual({ ...DEFAULT_GENERAL_SETTINGS, theme: 'dark' });
  });

  it('persists updates and reloads them', () => {
    service.update({ language: 'en', currency: 'USD' });
    const reloaded = create();
    expect(reloaded.settings().language).toBe('en');
    expect(reloaded.settings().currency).toBe('USD');
    expect(reloaded.t().months[0]).toBe('January');
  });

  it('ignores a corrupt settings entry', () => {
    nsState.settings.set('general-settings', '{"theme":42}');
    expect(create().settings().theme).toBe('dark');
  });

  it('switches theme classes, following the system when asked', () => {
    service.update({ theme: 'light' });
    expect(nsState.rootView!.cssClasses.has('ns-light')).toBe(true);
    expect(nsState.rootView!.cssClasses.has('ns-dark')).toBe(false);

    nsState.systemAppearance = 'dark';
    service.update({ theme: 'system' });
    expect(nsState.rootView!.cssClasses.has('ns-dark')).toBe(true);

    nsState.systemAppearance = null;
    service.applyTheme();
    expect(nsState.rootView!.cssClasses.has('ns-light')).toBe(true);
  });

  it('does nothing without a root view', () => {
    nsState.rootView = null;
    expect(() => service.applyTheme()).not.toThrow();
  });

  it('formats amounts per language and explicit format', () => {
    expect(service.formatAmount(1234.5)).toBe('1\u00A0234,50\u00A0\u20AC');
    expect(service.formatAmount(-0.5)).toBe('-0,50\u00A0\u20AC');
    expect(service.decimalSeparator).toBe(',');
    service.update({ language: 'en', currency: 'GBP' });
    expect(service.formatAmount(1234.5)).toBe('\u00A31,234.50');
    expect(service.decimalSeparator).toBe('.');
    service.update({ amountFormat: 'space-comma' });
    expect(service.formatAmount(10)).toBe('10,00\u00A0\u00A3');
    service.update({ amountFormat: 'comma-dot', currency: 'CHF' });
    expect(service.formatAmount(10)).toBe('CHF10.00');
    expect(service.formatSigned('income', 3)).toBe('+CHF3.00');
    expect(service.formatSigned('expense', 3)).toBe('-CHF3.00');
  });

  it('formats and normalises edit-field input', () => {
    expect(service.formatInput(3.1)).toBe('3,10');
    expect(service.normalizeInput('  ')).toBe('');
    expect(service.normalizeInput('1 234.5')).toBe('1234,50');
    expect(service.normalizeInput('abc')).toBe('abc');
    service.update({ language: 'en' });
    expect(service.formatInput(3.1)).toBe('3.10');
  });

  it('formats dates and month labels', () => {
    expect(service.formatDate('2024-03-09')).toBe('09/03/2024');
    expect(service.monthLabel('2024-03')).toBe('Mars 2024');
    service.update({ language: 'en' });
    expect(service.formatDate('2024-03-09')).toBe('03/09/2024');
    expect(service.monthLabel('2024-03')).toBe('March 2024');
    service.update({ dateFormat: 'yyyy-mm-dd' });
    expect(service.formatDate('2024-03-09')).toBe('2024-03-09');
    service.update({ dateFormat: 'dd-mm-yyyy' });
    expect(service.formatDate('2024-03-09')).toBe('09/03/2024');
  });
});
