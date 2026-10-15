import { Injectable, inject } from '@angular/core';
import { openFilePicker, saveFile } from '@nativescript-community/ui-document-picker';
import { File } from '@nativescript/core';
import { CONFIG_FILE_EXTENSION, openConfig, sealConfig, type ConfigData } from 'budget-lib';

import { BankService } from './bank/bank.service';
import { BudgetService } from './budget.service';
import { CalendarSyncService } from './calendar-sync.service';
import { nativeConfigCipher } from './config-cipher';
import { readBankKey, readCalendarPassword } from './secrets';
import { SettingsService } from './settings.service';

/** The file's name on export: the date tells copies apart. */
export const configFileName = (date = new Date()): string => `budget-config-${date.toISOString().slice(0, 10)}${CONFIG_FILE_EXTENSION}`;

/**
 * Moves the configuration (settings, calendar account, bank credentials) to another device as
 * an encrypted file (`budget-lib` config-archive): the cryptography is `config-cipher`, the
 * files go through the system document picker (`@nativescript-community/ui-document-picker`).
 */
@Injectable({ providedIn: 'root' })
export class ConfigArchiveService {
  private readonly budget = inject(BudgetService);
  private readonly settings = inject(SettingsService);
  private readonly calendar = inject(CalendarSyncService);
  private readonly bank = inject(BankService);

  /** Everything the file holds; `bank` is null until an application id or a key was set. */
  collect(): ConfigData {
    const bankConfig = this.bank.config();
    const privateKey = readBankKey();
    return {
      general: { ...this.settings.settings() },
      thresholds: { ...this.budget.thresholds() },
      calendar: { ...this.calendar.config(), proxyUrl: '', password: readCalendarPassword() },
      bank: bankConfig.applicationId === '' && privateKey === '' ? null : { config: { ...bankConfig }, privateKey },
    };
  }

  /** Encrypts the configuration and lets the user choose where to save it; false when they gave up. */
  async exportEncrypted(passphrase: string): Promise<boolean> {
    const text = await sealConfig(this.collect(), passphrase, nativeConfigCipher);
    return saveFile({ name: configFileName(), data: text, mimeType: 'application/json' });
  }

  /** Lets the user pick a file and returns its text; null when nothing was picked. */
  async pickFile(): Promise<string | null> {
    // `.budgetcfg` has no system type: `public.item` keeps every file selectable on iOS (a file with an unknown
    // extension is greyed out otherwise); `*/*` on Android. The exported type declared in Info.plist names ours.
    const { files } = await openFilePicker({ multipleSelection: false, extensions: ['public.item', 'org.arkdev.budgetmobile.config'] });
    if (files.length === 0) return null;
    return File.fromPath(files[0]).readText();
  }

  /** Decrypts the text of a file; throws `ConfigFileError` when it cannot be opened. */
  openEncrypted(text: string, passphrase: string): Promise<ConfigData> {
    return openConfig(text, passphrase, nativeConfigCipher);
  }

  /**
   * Applies an imported configuration. Empty secrets keep the current ones; the calendar service
   * forgets the old password itself when the account changes.
   */
  apply(data: ConfigData): void {
    this.settings.update(data.general);
    this.budget.setThresholds({ ...data.thresholds });
    const { enabled, calendarUrl, username, syncIntervalMinutes, password } = data.calendar;
    this.calendar.configure({ enabled, calendarUrl, username, syncIntervalMinutes }, password === '' ? null : password);
    if (data.bank !== null) this.bank.importConfig(data.bank.config, data.bank.privateKey);
  }
}
