import { Injectable, computed, inject, signal } from '@angular/core';
import { Application, isAndroid, Utils, type AndroidActivityNewIntentEventData } from '@nativescript/core';
import {
  bankImportStart, BankApiError, EnableBankingClient, isBankRedirect, isSessionExpired, normalizePrivateKey,
  parseBankRedirect, toBudgetTransactions,
  type Aspsp, type BankSession, type Transaction,
} from 'budget-lib';

import { BudgetService } from '../budget.service';
import { readBankKey, writeBankKey } from '../secrets';
import { SettingsService } from '../settings.service';
import { createId, readJson, writeJson } from '../storage';
import { nativeBankHttp, rsaSigner } from './platform';

const STATE_KEY = 'bank-state';
const AUTO_IMPORT_EVERY_MS = 6 * 3600 * 1000;
const MAX_REMEMBERED_IDS = 5000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_REDIRECT_URL = 'budgetmobile://bank';

export interface BankConfig {
  applicationId: string;
  bankName: string;
  bankCountry: string;
  bankConsentSeconds: number;
  redirectUrl: string;
  /** Only transactions on or after this day (YYYY-MM-DD) are imported. */
  importFrom: string;
}

interface StoredBank {
  config: BankConfig;
  session: BankSession | null;
  /** The `state` of the authorisation in progress, checked when the bank sends the user back. */
  pendingState: string;
  lastImportAt: string;
  /** Imported once: a transaction deleted from the budget is not brought back by the next import. */
  importedIds: string[];
}

export interface BankNotice {
  tone: 'info' | 'error';
  text: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const defaultStored = (): StoredBank => ({
  config: {
    applicationId: '', bankName: '', bankCountry: 'FR', bankConsentSeconds: 0,
    redirectUrl: DEFAULT_REDIRECT_URL, importFrom: `${today().slice(0, 8)}01`,
  },
  session: null,
  pendingState: '',
  lastImportAt: '',
  importedIds: [],
});

const isStoredBank = (value: unknown): value is StoredBank => {
  const candidate = value as Partial<StoredBank> | null;
  return typeof candidate === 'object' && candidate !== null
    && typeof candidate.config?.applicationId === 'string'
    && typeof candidate.pendingState === 'string'
    && Array.isArray(candidate.importedIds);
};

const randomState = (): string => `${createId()}${createId()}`;

/**
 * Brings the transactions of a bank account into the budget through Enable Banking.
 * The application id and private key are the user's own (Enable Banking "linked accounts"
 * mode); the key stays in the device's secure storage.
 */
@Injectable({ providedIn: 'root' })
export class BankService {
  private readonly budget = inject(BudgetService);
  private readonly settings = inject(SettingsService);
  private readonly stored = signal<StoredBank>(readJson(STATE_KEY, isStoredBank, defaultStored));
  private started = false;
  private banks: Aspsp[] | null = null;

  readonly config = computed(() => this.stored().config);
  readonly session = computed(() => this.stored().session);
  readonly lastImportAt = computed(() => this.stored().lastImportAt);
  readonly busy = signal(false);
  readonly notice = signal<BankNotice | null>(null);
  readonly hasKey = signal(readBankKey() !== '');
  readonly connected = computed(() => this.session() !== null);
  readonly expired = computed(() => isSessionExpired(this.session()));

  /** Listens for the return of the bank, and imports on start and resume when the last import is old. */
  start(): void {
    if (this.started) return;
    this.started = true;

    const onUrl = (url: string): void => {
      if (isBankRedirect(url, this.config().redirectUrl)) void this.handleRedirect(url);
    };
    try {
      Application.on('sceneOpenURLContexts', (args) => {
        const contexts = args.urlContexts.allObjects;
        for (let index = 0; index < contexts.count; index++) {
          const url = contexts.objectAtIndex(index).URL?.absoluteString;
          if (url) onUrl(url);
        }
      });
      if (isAndroid) {
        Application.android.on(Application.android.activityNewIntentEvent, (args: AndroidActivityNewIntentEventData) => {
          const data = args.intent?.getData();
          if (data) onUrl(data.toString());
        });
      }
    } catch (error) {
      console.warn('Deep links are unavailable:', error);
    }
    Application.on(Application.resumeEvent, () => void this.autoImport());
    void this.autoImport();
  }

  saveCredentials(applicationId: string, privateKey: string): void {
    if (privateKey.trim() !== '') {
      writeBankKey(normalizePrivateKey(privateKey));
      this.hasKey.set(true);
    }
    this.update({ config: { ...this.config(), applicationId: applicationId.trim() } });
  }

  saveSettings(redirectUrl: string, importFrom: string): boolean {
    if (!DATE_PATTERN.test(importFrom.trim())) {
      this.fail(this.settings.t().bank.invalidDate);
      return false;
    }
    this.update({ config: { ...this.config(), redirectUrl: redirectUrl.trim(), importFrom: importFrom.trim() } });
    this.notice.set(null);
    return true;
  }

  /** The banks of France that can be connected (cached for the session). */
  async listBanks(): Promise<Aspsp[]> {
    if (this.banks !== null) return this.banks;
    const client = this.client();
    if (client === null) return [];
    const list = (await this.guard(() => client.listBanks('FR'))) ?? [];
    if (list.length > 0) this.banks = list;
    return list;
  }

  /** Opens the bank's authorisation page; the bank then sends the user back with a code. */
  async connect(bank: Aspsp): Promise<void> {
    const client = this.client();
    if (client === null) return;
    const state = randomState();
    const url = await this.guard(() => client.startAuthorization(
      bank, this.config().redirectUrl, state, this.settings.settings().language,
    ));
    if (url === undefined) return;
    this.update({
      config: { ...this.config(), bankName: bank.name, bankCountry: bank.country, bankConsentSeconds: bank.maximumConsentSeconds },
      pendingState: state,
    });
    this.notice.set({ tone: 'info', text: this.settings.t().bank.waitingForBank });
    Utils.openUrl(url);
  }

  /** Finishes the connection from the URL (or bare code) the bank sent back, then imports. */
  async handleRedirect(input: string): Promise<void> {
    const t = this.settings.t().bank;
    const { code, state, error } = parseBankRedirect(input);
    const pending = this.stored().pendingState;
    if (error !== '') return this.fail(t.refused(error));
    if (pending === '' || (state !== '' && state !== pending)) return this.fail(t.unexpectedReturn);
    if (code === '') return this.fail(t.noCode);

    const client = this.client();
    if (client === null) return;
    const session = await this.guard(() => client.createSession(code));
    if (session === undefined) return;
    this.update({ session, pendingState: '' });
    await this.importNow();
  }

  /** Fetches the booked transactions since the last import and adds the new ones to the budget. */
  async importNow(silent = false): Promise<void> {
    const t = this.settings.t().bank;
    const { session } = this.stored();
    if (session === null) return silent ? undefined : this.fail(t.notConnected);
    if (this.expired()) return silent ? undefined : this.fail(t.expired);
    const client = this.client();
    if (client === null) return;

    const dateFrom = bankImportStart(this.config().importFrom, this.stored().lastImportAt);
    const categories = this.budget.categories();
    const incoming = await this.guard(async () => {
      const all: Transaction[] = [];
      for (const account of session.accounts) {
        all.push(...toBudgetTransactions(account.uid, await client.transactions(account.uid, dateFrom), categories));
      }
      return all;
    }, silent);
    if (incoming === undefined) return;

    const known = new Set(this.stored().importedIds);
    const fresh = incoming.filter((tx) => !known.has(tx.id));
    const added = this.budget.importTransactions(fresh);
    const importedIds = [...this.stored().importedIds, ...fresh.map((tx) => tx.id)].slice(-MAX_REMEMBERED_IDS);
    this.update({ lastImportAt: new Date().toISOString(), importedIds });
    this.notice.set({ tone: 'info', text: t.imported(added) });
  }

  /** Forgets the connection (the credentials and the list of imported transactions stay). */
  disconnect(): void {
    this.update({ session: null, pendingState: '' });
    this.notice.set(null);
  }

  forgetCredentials(): void {
    writeBankKey('');
    this.hasKey.set(false);
    this.disconnect();
    this.update({ config: { ...this.config(), applicationId: '' } });
  }

  private async autoImport(): Promise<void> {
    const { lastImportAt, session } = this.stored();
    if (session === null || this.expired() || this.busy()) return;
    if (lastImportAt !== '' && Date.now() - Date.parse(lastImportAt) < AUTO_IMPORT_EVERY_MS) return;
    await this.importNow(true);
  }

  private client(): EnableBankingClient | null {
    const { applicationId } = this.config();
    const key = readBankKey();
    if (applicationId === '' || key === '') {
      this.fail(this.settings.t().bank.missingCredentials);
      return null;
    }
    return new EnableBankingClient(nativeBankHttp, rsaSigner, applicationId, key);
  }

  /** Runs a call with the busy flag on; errors become a notice and the result `undefined`. */
  private async guard<T>(call: () => Promise<T>, silent = false): Promise<T | undefined> {
    this.busy.set(true);
    try {
      return await call();
    } catch (error) {
      if (!silent) this.fail(this.describeError(error));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  private describeError(error: unknown): string {
    const t = this.settings.t().bank;
    if (!(error instanceof BankApiError)) return t.failed(error instanceof Error ? error.message : String(error));
    switch (error.kind) {
      case 'network': return t.network;
      case 'rate-limit': return t.rateLimit;
      case 'expired': return t.expired;
      case 'auth': return t.authRefused(error.message);
      default: return t.failed(error.message);
    }
  }

  private fail(text: string): void {
    this.notice.set({ tone: 'error', text });
  }

  private update(patch: Partial<StoredBank>): void {
    const next = { ...this.stored(), ...patch };
    this.stored.set(next);
    writeJson(STATE_KEY, next);
  }
}
