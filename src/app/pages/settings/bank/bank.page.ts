import { Component, NO_ERRORS_SCHEMA, computed, inject, signal } from '@angular/core';
import { NativeScriptCommonModule, RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';

import type { Aspsp } from 'budget-lib';

import { BankService } from '../../../core/bank/bank.service';
import { SettingsService } from '../../../core/settings.service';

const MAX_CHOICES = 30;
const DEFAULT_QUERY = 'Bretagne';

const fold = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

@Component({
  selector: 'ns-bank',
  imports: [NativeScriptCommonModule],
  schemas: [NO_ERRORS_SCHEMA],
  templateUrl: './bank.page.html',
})
export class BankPage {
  readonly bank = inject(BankService);
  readonly s = inject(SettingsService);
  readonly router = inject(RouterExtensions);

  readonly applicationId = signal(this.bank.config().applicationId);
  readonly privateKey = signal('');
  readonly query = signal(this.bank.config().bankName || DEFAULT_QUERY);
  readonly redirectUrl = signal(this.bank.config().redirectUrl);
  readonly importFrom = signal(this.bank.config().importFrom);
  readonly pasted = signal('');

  readonly status = computed(() => {
    const t = this.s.t().bank;
    const session = this.bank.session();
    return session === null ? t.notConnectedStatus : t.connectedStatus(this.bank.config().bankName, session.accounts.length);
  });
  readonly validity = computed(() => {
    const until = this.bank.session()?.validUntil ?? '';
    return until === '' ? '' : this.s.t().bank.validUntil(this.s.formatDate(until.slice(0, 10)));
  });
  readonly lastImport = computed(() => {
    const t = this.s.t().bank;
    const iso = this.bank.lastImportAt();
    if (iso === '') return t.lastImport(t.never);
    const date = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return t.lastImport(`${this.s.formatDate(day)} ${pad(date.getHours())}:${pad(date.getMinutes())}`);
  });

  saveCredentials(): void {
    this.bank.saveCredentials(this.applicationId(), this.privateKey());
    this.privateKey.set('');
  }

  saveSettings(): void {
    this.bank.saveSettings(this.redirectUrl(), this.importFrom());
  }

  /** Looks the typed name up in the bank list, lets the user pick when several match, then starts the connection. */
  async connect(): Promise<void> {
    const t = this.s.t();
    this.saveCredentials();
    if (!this.bank.saveSettings(this.redirectUrl(), this.importFrom())) return;

    const needle = fold(this.query().trim());
    const matches = (await this.bank.listBanks()).filter((bank) => fold(bank.name).includes(needle));
    if (matches.length === 0) {
      if (this.bank.notice() === null) await Dialogs.alert({ message: t.bank.noBank, okButtonText: t.common.ok });
      return;
    }
    const chosen = matches.length === 1 ? matches[0] : await this.pick(matches.slice(0, MAX_CHOICES));
    if (chosen !== undefined) await this.bank.connect(chosen);
  }

  async finish(): Promise<void> {
    await this.bank.handleRedirect(this.pasted());
    if (this.bank.connected()) this.pasted.set('');
  }

  async disconnect(): Promise<void> {
    const t = this.s.t();
    const ok = await Dialogs.confirm({
      title: t.bank.disconnect, message: this.bank.config().bankName,
      okButtonText: t.bank.disconnect, cancelButtonText: t.common.cancel,
    });
    if (ok) this.bank.disconnect();
  }

  async forget(): Promise<void> {
    const t = this.s.t();
    const ok = await Dialogs.confirm({
      title: t.bank.forget, message: t.bank.keyWarning,
      okButtonText: t.common.delete, cancelButtonText: t.common.cancel,
    });
    if (!ok) return;
    this.bank.forgetCredentials();
    this.applicationId.set('');
    this.privateKey.set('');
  }

  private async pick(banks: Aspsp[]): Promise<Aspsp | undefined> {
    const t = this.s.t();
    const names = banks.map((bank) => bank.name);
    const picked = await Dialogs.action({ title: t.bank.chooseBank, cancelButtonText: t.common.cancel, actions: names });
    return banks[names.indexOf(picked)];
  }
}
