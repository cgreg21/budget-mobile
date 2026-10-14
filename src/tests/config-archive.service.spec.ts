import { TestBed } from '@angular/core/testing';
import { ConfigFileError, DEFAULT_BALANCE_THRESHOLDS, emptyConfigData, normalizePrivateKey, openConfig, webCryptoConfigCipher, type ConfigData, type WebCryptoLike } from 'budget-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BankService } from '~/app/core/bank/bank.service';
import { BudgetService } from '~/app/core/budget.service';
import { CalendarSyncService } from '~/app/core/calendar-sync.service';
import { ConfigArchiveService, configFileName } from '~/app/core/config-archive.service';
import { nativeConfigCipher } from '~/app/core/config-cipher';
import { readBankKey, readCalendarPassword, writeBankKey, writeCalendarPassword } from '~/app/core/secrets';
import { SettingsService } from '~/app/core/settings.service';
import { seedDatabase } from './helpers';
import { openFilePicker, saveFile } from './stubs/document-picker';
import { nsState } from './stubs/nativescript-core';

const webCipher = webCryptoConfigCipher(globalThis.crypto as unknown as WebCryptoLike);

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----';
/** What the bank service stores (`normalizePrivateKey`). */
const STORED_PEM = normalizePrivateKey(PEM);

const imported = (): ConfigData => ({
  general: { language: 'en', currency: 'GBP', dateFormat: 'mm-dd-yyyy', amountFormat: 'comma-dot', theme: 'light' },
  thresholds: { low: 1, medium: 2, high: 3 },
  calendar: { enabled: true, calendarUrl: 'https://other.example/cal/', username: 'other', proxyUrl: 'https://proxy.example', password: 'new-password' },
  bank: {
    config: { applicationId: 'app-2', bankName: 'Other Bank', bankCountry: 'FR', bankConsentSeconds: 50, redirectUrl: 'budgetmobile://bank', importFrom: '2024-02-01' },
    privateKey: PEM,
  },
});

describe('ConfigArchiveService', () => {
  let service: ConfigArchiveService;
  let settings: SettingsService;
  let budget: BudgetService;
  let calendar: CalendarSyncService;
  let bank: BankService;

  beforeEach(async () => {
    vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
    await seedDatabase();
    service = TestBed.inject(ConfigArchiveService);
    settings = TestBed.inject(SettingsService);
    budget = TestBed.inject(BudgetService);
    calendar = TestBed.inject(CalendarSyncService);
    bank = TestBed.inject(BankService);
  });

  it('names the file after the day', () => {
    expect(configFileName()).toBe('budget-config-2024-03-15.budgetcfg');
  });

  it('collects an empty configuration without a bank section', () => {
    expect(service.collect()).toEqual({
      ...emptyConfigData(),
      general: { ...emptyConfigData().general, theme: 'dark' },
      thresholds: DEFAULT_BALANCE_THRESHOLDS,
    });
  });

  it('collects the settings, the calendar account and the bank credentials', () => {
    settings.update({ language: 'en', currency: 'USD' });
    budget.setThresholds({ low: 5, medium: 6, high: 7 });
    calendar.configure({ enabled: true, calendarUrl: 'https://cal.example/u/', username: 'me' }, 'secret', false);
    bank.saveCredentials('app-1', PEM);
    const data = service.collect();
    expect(data.general).toMatchObject({ language: 'en', currency: 'USD' });
    expect(data.thresholds).toEqual({ low: 5, medium: 6, high: 7 });
    expect(data.calendar).toEqual({ enabled: true, calendarUrl: 'https://cal.example/u', username: 'me', proxyUrl: '', password: 'secret' });
    expect(data.bank).toEqual({ config: { ...bank.config(), applicationId: 'app-1' }, privateKey: STORED_PEM });
  });

  it('exports an encrypted file through the document picker', async () => {
    calendar.configure({ enabled: false, calendarUrl: 'https://cal.example/u/', username: 'me' }, 'secret', false);
    saveFile.mockResolvedValue(true);
    expect(await service.exportEncrypted('a good passphrase')).toBe(true);
    const [params] = saveFile.mock.calls[0];
    expect(params.name).toBe('budget-config-2024-03-15.budgetcfg');
    expect(params.mimeType).toBe('application/json');
    expect(params.data).not.toContain('secret');
    expect(params.data).not.toContain('cal.example');
    const opened = await openConfig(params.data, 'a good passphrase', webCipher);
    expect(opened.calendar).toMatchObject({ calendarUrl: 'https://cal.example/u', password: 'secret' });
    expect(opened.bank).toBeNull();

    saveFile.mockResolvedValue(false);
    expect(await service.exportEncrypted('a good passphrase')).toBe(false);
    await expect(service.exportEncrypted('short')).rejects.toMatchObject({ code: 'weak-passphrase' });
  }, 20_000);

  it('reads the picked file, or nothing when the user gives up', async () => {
    expect(await service.pickFile()).toBeNull();
    expect(openFilePicker).toHaveBeenCalledWith(expect.objectContaining({ multipleSelection: false }));
    nsState.files.set('content://docs/1', '{"format":"x"}');
    openFilePicker.mockResolvedValue({ files: ['content://docs/1'] });
    expect(await service.pickFile()).toBe('{"format":"x"}');
    openFilePicker.mockResolvedValue({ files: ['content://docs/missing'] });
    await expect(service.pickFile()).rejects.toThrow('No such file');
  });

  it('opens a file with the phone cipher and reports what is wrong with it', async () => {
    await expect(service.openEncrypted('not json', 'whatever')).rejects.toBeInstanceOf(ConfigFileError);
    const { sealConfig } = await import('budget-lib');
    const text = await sealConfig(imported(), 'a good passphrase', nativeConfigCipher, { iterations: 200 });
    expect(await service.openEncrypted(text, 'a good passphrase')).toMatchObject(imported());
    await expect(service.openEncrypted(text, 'a bad passphrase')).rejects.toMatchObject({ code: 'passphrase' });
  });

  it('applies every section of an imported configuration', () => {
    const configure = vi.spyOn(calendar, 'configure');
    service.apply(imported());
    expect(settings.settings()).toEqual(imported().general);
    expect(budget.thresholds()).toEqual({ low: 1, medium: 2, high: 3 });
    expect(configure).toHaveBeenCalledWith({ enabled: true, calendarUrl: 'https://other.example/cal/', username: 'other' }, 'new-password');
    expect(calendar.config()).toEqual({ enabled: true, calendarUrl: 'https://other.example/cal', username: 'other' });
    expect(readCalendarPassword()).toBe('new-password');
    expect(bank.config()).toEqual(imported().bank?.config);
    expect(readBankKey()).toBe(STORED_PEM);
    expect(bank.hasKey()).toBe(true);
  });

  it('keeps the current secrets when the file carries none, and the bank when it has no section', () => {
    writeCalendarPassword('kept');
    calendar.configure({ enabled: false, calendarUrl: 'https://other.example/cal/', username: 'other' }, 'kept', false);
    bank.saveCredentials('app-1', PEM);
    const data = imported();
    data.calendar.password = '';
    data.bank = null;
    service.apply(data);
    expect(readCalendarPassword()).toBe('kept');
    expect(calendar.config().enabled).toBe(true);
    expect(bank.config().applicationId).toBe('app-1');
    expect(readBankKey()).toBe(STORED_PEM);

    // A bank section without a key: the configuration changes, the key stays.
    service.apply({ ...imported(), bank: { config: { ...imported().bank!.config, applicationId: 'app-1' }, privateKey: '' } });
    expect(bank.config().bankName).toBe('Other Bank');
    expect(readBankKey()).toBe(STORED_PEM);
  });
});

describe('BankService.importConfig', () => {
  it('drops the session when the application changes, keeps it otherwise', async () => {
    await seedDatabase();
    const config = { applicationId: 'app-1', bankName: 'B', bankCountry: 'FR', bankConsentSeconds: 100, redirectUrl: 'budgetmobile://bank', importFrom: '2024-03-01' };
    const session = { sessionId: 's', accounts: [], validUntil: '2030-01-01T00:00:00Z' };
    nsState.settings.set('bank-state', JSON.stringify({ config, session, pendingState: 'p', lastImportAt: '', importedIds: [] }));
    TestBed.resetTestingModule();
    const bank = TestBed.inject(BankService);
    expect(bank.connected()).toBe(true);
    bank.importConfig({ ...config, bankName: 'Renamed' }, '');
    expect(bank.config().bankName).toBe('Renamed');
    expect(bank.connected()).toBe(true);
    bank.importConfig({ ...config, applicationId: 'app-2' }, '');
    expect(bank.config().applicationId).toBe('app-2');
    expect(bank.connected()).toBe(false);
    expect(bank.notice()).toBeNull();
    expect(JSON.parse(nsState.settings.get('bank-state')!)).toMatchObject({ session: null, pendingState: '' });
  });
});
