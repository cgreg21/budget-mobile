import { Http } from '@nativescript/core';

import type { BankTransaction } from './bank-mapping';
import { TokenSource } from './jwt';

const API_URL = 'https://api.enablebanking.com';
const TIMEOUT_MS = 30000;
const MAX_PAGES = 50;
const DEFAULT_CONSENT_SECONDS = 90 * 24 * 3600;

/** Why a call failed, so the UI can say what to do about it. */
export type BankErrorKind = 'network' | 'auth' | 'expired' | 'rate-limit' | 'rejected';

export class BankApiError extends Error {
  readonly kind: BankErrorKind;
  readonly status: number;

  constructor(kind: BankErrorKind, message: string, status: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface Aspsp {
  name: string;
  country: string;
  /** How long the bank lets an access last. */
  maximumConsentSeconds: number;
}

export interface BankAccount {
  uid: string;
  /** What lets the user recognise the account. */
  label: string;
}

export interface BankSession {
  sessionId: string;
  accounts: BankAccount[];
  validUntil: string;
}

interface ErrorBody {
  message?: string;
  error?: string;
}

interface RawAccount {
  uid?: string;
  account_id?: { iban?: string };
  name?: string;
  details?: string;
  product?: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Enable Banking's account information API (https://enablebanking.com/docs/api/reference/). */
export class EnableBankingClient {
  private readonly tokens: TokenSource;

  constructor(applicationId: string, privateKey: string) {
    this.tokens = new TokenSource(applicationId, privateKey);
  }

  /** The banks of a country that can be connected. */
  async listBanks(country: string): Promise<Aspsp[]> {
    const body = await this.request('GET', `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
    const list = (body as { aspsps?: { name?: string; country?: string; maximum_consent_validity?: number }[] }).aspsps ?? [];
    return list
      .filter((bank) => text(bank.name) !== '')
      .map((bank) => ({
        name: text(bank.name),
        country: text(bank.country) || country,
        maximumConsentSeconds: bank.maximum_consent_validity ?? DEFAULT_CONSENT_SECONDS,
      }));
  }

  /** Starts the authorisation: returns the page the user has to open to give access. */
  async startAuthorization(bank: Aspsp, redirectUrl: string, state: string, language: string): Promise<string> {
    const validUntil = new Date(Date.now() + bank.maximumConsentSeconds * 1000 - 60000).toISOString();
    const body = await this.request('POST', '/auth', {
      access: { valid_until: validUntil, balances: true, transactions: true },
      aspsp: { name: bank.name, country: bank.country },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
      language,
    });
    const url = text((body as { url?: unknown }).url);
    if (url === '') throw new BankApiError('rejected', 'No authorisation URL returned', 200);
    return url;
  }

  /** Exchanges the code received after the authorisation for a session and the accounts it gives access to. */
  async createSession(code: string): Promise<BankSession> {
    const body = await this.request('POST', '/sessions', { code }) as {
      session_id?: string; accounts?: RawAccount[]; access?: { valid_until?: string };
    };
    const accounts = (body.accounts ?? [])
      .filter((account) => text(account.uid) !== '')
      .map((account) => ({
        uid: text(account.uid),
        label: [text(account.details) || text(account.name) || text(account.product), text(account.account_id?.iban)]
          .filter((part) => part !== '').join(' - ') || text(account.uid),
      }));
    const sessionId = text(body.session_id);
    if (sessionId === '' || accounts.length === 0) throw new BankApiError('rejected', 'No account was shared', 200);
    return { sessionId, accounts, validUntil: text(body.access?.valid_until) };
  }

  /** Booked transactions of an account since `dateFrom` (YYYY-MM-DD), every page of them. */
  async transactions(accountUid: string, dateFrom: string): Promise<BankTransaction[]> {
    const result: BankTransaction[] = [];
    let continuation = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = `date_from=${encodeURIComponent(dateFrom)}&transaction_status=BOOK`
        + (continuation === '' ? '' : `&continuation_key=${encodeURIComponent(continuation)}`);
      const body = await this.request('GET', `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`) as {
        transactions?: BankTransaction[]; continuation_key?: string | null;
      };
      result.push(...(body.transactions ?? []));
      continuation = text(body.continuation_key);
      if (continuation === '') break;
    }
    return result;
  }

  private async request(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<unknown> {
    let status: number;
    let raw: string;
    try {
      const response = await Http.request({
        url: `${API_URL}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${this.tokens.get()}`,
          Accept: 'application/json',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        timeout: TIMEOUT_MS,
        ...(payload === undefined ? {} : { content: JSON.stringify(payload) }),
      });
      status = response.statusCode;
      raw = response.content ? response.content.toString() : '';
    } catch (error) {
      throw new BankApiError('network', error instanceof Error ? error.message : String(error), 0);
    }

    let body: unknown = {};
    try {
      body = raw === '' ? {} : JSON.parse(raw);
    } catch {
      body = {};
    }
    if (status >= 200 && status < 300) return body;

    const { message, error } = body as ErrorBody;
    const detail = text(message) || text(error) || `HTTP ${status}`;
    if (status === 429) throw new BankApiError('rate-limit', detail, status);
    if (status === 401 || status === 403) {
      const expired = /session|expired|consent|closed/i.test(`${text(error)} ${text(message)}`);
      throw new BankApiError(expired ? 'expired' : 'auth', detail, status);
    }
    if (status >= 500 || status === 408) throw new BankApiError('network', detail, status);
    throw new BankApiError('rejected', detail, status);
  }
}
