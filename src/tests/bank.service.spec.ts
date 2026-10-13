import { TestBed } from '@angular/core/testing';
import { DEFAULT_GENERAL_SETTINGS, type BankState, type BankTransaction } from 'budget-lib';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BankService, DEFAULT_REDIRECT_URL } from '~/app/core/bank/bank.service';
import { BudgetService } from '~/app/core/budget.service';
import { seedDatabase } from './helpers';
import { Application, Http, Utils, nsState } from './stubs/nativescript-core';
import { secureState } from './stubs/secure-storage';

const { privateKey: PRIVATE_KEY } = generateKeyPairSync('rsa', {
  modulusLength: 1024, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

type Request = { method: string; url: string; headers: Record<string, string>; content?: string };

const entry = (id: string, amount: string, extra: Partial<BankTransaction> = {}): BankTransaction => ({
  entry_reference: id, transaction_amount: { currency: 'EUR', amount }, credit_debit_indicator: 'DBIT',
  status: 'BOOK', booking_date: '2024-03-12', creditor: { name: `Shop ${id}` }, ...extra,
});

/** Enable Banking, as far as the service goes. */
class FakeBank {
  requests: Request[] = [];
  banks: unknown[] = [{ name: 'Cr\u00e9dit Mutuel de Bretagne', country: 'FR', maximum_consent_validity: 7776000 }, { name: 'Banque Populaire' }, { name: '' }];
  transactions: BankTransaction[] = [entry('t1', '-12.50'), entry('t2', '3000', { credit_debit_indicator: 'CRDT', remittance_information: ['SALAIRE MARS'] })];
  authUrl = 'https://bank.example/authorize';
  /** Status + body forced on the next request. */
  next: { status: number; body: unknown } | null = null;

  handle = async (request: Request): Promise<{ statusCode: number; content: { toString(): string } }> => {
    this.requests.push(request);
    const reply = (status: number, body: unknown) => ({ statusCode: status, content: { toString: () => JSON.stringify(body) } });
    if (this.next) {
      const { status, body } = this.next;
      this.next = null;
      return reply(status, body);
    }
    const path = request.url.replace('https://api.enablebanking.com', '');
    if (path.startsWith('/aspsps')) return reply(200, { aspsps: this.banks });
    if (path === '/auth') return reply(200, { url: this.authUrl });
    if (path === '/sessions') {
      return reply(200, { session_id: 's1', accounts: [{ uid: 'acc1', name: 'Main' }], access: { valid_until: '2030-01-01T00:00:00Z' } });
    }
    if (path.startsWith('/accounts/acc1/transactions')) return reply(200, { transactions: this.transactions });
    return reply(404, { message: 'unknown' });
  };
}

describe('BankService', () => {
  let bank: FakeBank;
  let budget: BudgetService;

  const create = (): BankService => {
    TestBed.resetTestingModule();
    budget = TestBed.inject(BudgetService);
    return TestBed.inject(BankService);
  };

  const withCredentials = (): BankService => {
    secureState.values.set('bank-private-key', PRIVATE_KEY);
    const service = create();
    service.saveCredentials('app-1', '');
    return service;
  };

  const connected = async (): Promise<BankService> => {
    const service = withCredentials();
    await service.connect({ name: 'B', country: 'FR', maximumConsentSeconds: 100 });
    const state = JSON.parse(nsState.settings.get('bank-state')!) as BankState;
    await service.handleRedirect(`${DEFAULT_REDIRECT_URL}?code=abc&state=${state.pendingState}`);
    bank.requests = [];
    service.notice.set(null);
    return service;
  };

  beforeEach(async () => {
    vi.setSystemTime(new Date('2024-03-15T10:00:00Z'));
    bank = new FakeBank();
    Http.request.mockImplementation(bank.handle as never);
    nsState.settings.set('general-settings', JSON.stringify({ ...DEFAULT_GENERAL_SETTINGS, language: 'en' }));
    await seedDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts from a default state', () => {
    const service = create();
    expect(service.config()).toEqual({ applicationId: '', bankName: '', bankCountry: 'FR', bankConsentSeconds: 0, redirectUrl: DEFAULT_REDIRECT_URL, importFrom: '2024-03-01' });
    expect(service.session()).toBeNull();
    expect(service.lastImportAt()).toBe('');
    expect(service.hasKey()).toBe(false);
    expect(service.connected()).toBe(false);
    expect(service.expired()).toBe(false);
    expect(service.busy()).toBe(false);
    expect(service.notice()).toBeNull();
  });

  it('saves the credentials, normalising the key, and the settings', () => {
    const service = create();
    service.saveCredentials(' app-1 ', '  -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----  ');
    expect(service.hasKey()).toBe(true);
    expect(service.config().applicationId).toBe('app-1');
    expect(secureState.values.get('bank-private-key')).toContain('BEGIN PRIVATE KEY');
    service.saveCredentials('app-2', '   ');
    expect(service.config().applicationId).toBe('app-2');
    expect(secureState.values.get('bank-private-key')).toContain('abc');

    expect(service.saveSettings('myapp://x', '2024-13-99x')).toBe(false);
    expect(service.notice()).toEqual({ tone: 'error', text: expect.stringMatching(/date/i) });
    expect(service.saveSettings(' myapp://x ', ' 2024-01-01 ')).toBe(true);
    expect(service.config()).toMatchObject({ redirectUrl: 'myapp://x', importFrom: '2024-01-01' });
    expect(service.notice()).toBeNull();
    expect(create().config().redirectUrl).toBe('myapp://x');
  });

  it('refuses to talk to the bank without credentials', async () => {
    const service = create();
    expect(await service.listBanks()).toEqual([]);
    expect(service.notice()).toEqual({ tone: 'error', text: expect.stringMatching(/application id/i) });
    service.notice.set(null);
    await service.connect({ name: 'B', country: 'FR', maximumConsentSeconds: 1 });
    expect(service.notice()?.tone).toBe('error');
    expect(Http.request).not.toHaveBeenCalled();
  });

  it('lists the banks once per session', async () => {
    const service = withCredentials();
    const list = await service.listBanks();
    expect(list).toEqual([
      { name: 'Cr\u00e9dit Mutuel de Bretagne', country: 'FR', maximumConsentSeconds: 7776000 },
      { name: 'Banque Populaire', country: 'FR', maximumConsentSeconds: 7776000 },
    ]);
    expect(bank.requests[0].url).toContain('/aspsps?country=FR');
    expect(bank.requests[0].headers.Authorization).toMatch(/^Bearer /);
    expect(await service.listBanks()).toBe(list);
    expect(bank.requests).toHaveLength(1);
  });

  it('does not cache an empty or failed list', async () => {
    const service = withCredentials();
    bank.banks = [];
    expect(await service.listBanks()).toEqual([]);
    bank.next = { status: 500, body: {} };
    expect(await service.listBanks()).toEqual([]);
    expect(service.notice()).toEqual({ tone: 'error', text: expect.stringMatching(/network|reach/i) });
    expect(bank.requests).toHaveLength(2);
  });

  it('starts the authorisation and opens the bank page', async () => {
    const service = withCredentials();
    await service.connect({ name: 'B', country: 'FR', maximumConsentSeconds: 100 });
    expect(Utils.openUrl).toHaveBeenCalledWith('https://bank.example/authorize');
    expect(service.config()).toMatchObject({ bankName: 'B', bankCountry: 'FR', bankConsentSeconds: 100 });
    expect(service.notice()).toEqual({ tone: 'info', text: expect.stringMatching(/browser/i) });
    const body = JSON.parse(bank.requests[0].content!);
    expect(body).toMatchObject({ redirect_url: DEFAULT_REDIRECT_URL, language: 'en', aspsp: { name: 'B', country: 'FR' } });
    expect(JSON.parse(nsState.settings.get('bank-state')!).pendingState).toBe(body.state);
  });

  it('reports a refused authorisation', async () => {
    const service = withCredentials();
    bank.next = { status: 200, body: {} };
    await service.connect({ name: 'B', country: 'FR', maximumConsentSeconds: 100 });
    expect(Utils.openUrl).not.toHaveBeenCalled();
    expect(service.notice()).toEqual({ tone: 'error', text: expect.stringContaining('No authorisation URL') });
  });

  it('validates the return of the bank', async () => {
    const service = withCredentials();
    await service.handleRedirect(`${DEFAULT_REDIRECT_URL}?error=access_denied`);
    expect(service.notice()?.text).toMatch(/access_denied/);
    await service.handleRedirect('somecode');
    expect(service.notice()?.text).toMatch(/does not match/i);

    await service.connect({ name: 'B', country: 'FR', maximumConsentSeconds: 100 });
    await service.handleRedirect(`${DEFAULT_REDIRECT_URL}?code=abc&state=wrong`);
    expect(service.notice()?.text).toMatch(/does not match/i);
    await service.handleRedirect(`${DEFAULT_REDIRECT_URL}?state=${service['stored']().pendingState}`);
    expect(service.notice()?.text).toMatch(/code/i);
    expect(service.connected()).toBe(false);

    // Credentials forgotten meanwhile: the exchange cannot proceed.
    secureState.values.delete('bank-private-key');
    await service.handleRedirect('abc');
    expect(service.connected()).toBe(false);
    expect(service.notice()?.text).toMatch(/application id/i);
  });

  it('exchanges the code for a session and imports the transactions', async () => {
    const service = withCredentials();
    await service.connect({ name: 'B', country: 'FR', maximumConsentSeconds: 100 });
    const { pendingState } = service['stored']();
    budget.selectMonth('2024-03');
    await service.handleRedirect(`${DEFAULT_REDIRECT_URL}?code=abc&state=${pendingState}`);

    expect(service.connected()).toBe(true);
    expect(service.session()).toEqual({ sessionId: 's1', accounts: [{ uid: 'acc1', label: 'Main' }], validUntil: '2030-01-01T00:00:00Z' });
    expect(service['stored']().pendingState).toBe('');
    expect(service.notice()).toEqual({ tone: 'info', text: '2 transactions imported.' });
    expect(service.lastImportAt()).toBe('2024-03-15T10:00:00.000Z');
    expect(budget.transactions().map((t) => [t.kind, t.amount, t.category])).toEqual([['expense', 12.5, 'Autres'], ['income', 3000, 'Salaire']]);
    expect(bank.requests.at(-1)!.url).toContain('date_from=2024-03-01');

    // A second import skips what is already known, including transactions deleted since.
    budget.remove(budget.transactions()[0].id);
    bank.transactions.push(entry('t3', '-5'));
    await service.importNow();
    expect(service.notice()).toEqual({ tone: 'info', text: '1 transaction imported.' });
    expect(budget.transactions()).toHaveLength(2);
    expect(bank.requests.at(-1)!.url).toContain('date_from=2024-03-08');
    await service.importNow();
    expect(service.notice()?.text).toMatch(/up to date/i);
  });

  it('refuses to import without a session or with an expired one', async () => {
    const service = withCredentials();
    await service.importNow();
    expect(service.notice()?.text).toMatch(/connect a bank/i);
    service.notice.set(null);
    await service.importNow(true);
    expect(service.notice()).toBeNull();

    await connected();
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
    const connectedService = create();
    expect(connectedService.expired()).toBe(true);
    await connectedService.importNow();
    expect(connectedService.notice()?.text).toMatch(/expired|renew/i);
    connectedService.notice.set(null);
    await connectedService.importNow(true);
    expect(connectedService.notice()).toBeNull();
  });

  it('describes every kind of failure', async () => {
    const service = await connected();
    const cases: [number, unknown, RegExp][] = [
      [500, {}, /network|reach/i],
      [429, {}, /too many|rate|later/i],
      [401, { error: 'session expired' }, /expired|renew/i],
      [401, { message: 'bad signature' }, /bad signature/],
      [400, { message: 'nope' }, /nope/],
    ];
    for (const [status, body, pattern] of cases) {
      bank.next = { status, body };
      await service.importNow();
      expect(service.notice(), String(status)).toEqual({ tone: 'error', text: expect.stringMatching(pattern) });
    }
    bank.next = { status: 500, body: {} };
    service.notice.set(null);
    await service.importNow(true);
    expect(service.notice()).toBeNull();
    expect(service.busy()).toBe(false);
  });

  it('reports failures that are not bank errors', async () => {
    const service = await connected();
    secureState.values.delete('bank-private-key');
    await service.importNow();
    expect(service.notice()?.text).toMatch(/application id/i);
    // A malformed entry breaks the conversion, outside the bank client.
    secureState.values.set('bank-private-key', PRIVATE_KEY);
    bank.transactions = [{ transaction_amount: null } as never];
    await service.importNow();
    expect(service.notice()?.text).toMatch(/Cannot read|null/);
    expect(bank.requests).toHaveLength(1);
  });

  it('disconnects and forgets the credentials', async () => {
    const service = await connected();
    service.disconnect();
    expect(service.connected()).toBe(false);
    expect(service['stored']().importedIds.length).toBe(2);
    expect(service.hasKey()).toBe(true);
    service.forgetCredentials();
    expect(service.hasKey()).toBe(false);
    expect(service.config().applicationId).toBe('');
    expect(secureState.values.has('bank-private-key')).toBe(false);
  });

  it('loads a stored state and ignores a corrupt one', async () => {
    const service = await connected();
    const again = create();
    expect(again.connected()).toBe(true);
    expect(again.lastImportAt()).toBe(service.lastImportAt());
    nsState.settings.set('bank-state', JSON.stringify({ config: {} }));
    expect(create().connected()).toBe(false);
  });

  describe('start', () => {
    it('imports on start when due, then on resume and deep links', async () => {
      const service = await connected();
      nsState.settings.set('bank-state', JSON.stringify({ ...service['stored'](), lastImportAt: '2024-03-15T03:59:00Z' }));
      const fresh = create();
      fresh.start();
      fresh.start();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fresh.lastImportAt()).toBe('2024-03-15T10:00:00.000Z');
      expect(bank.requests).toHaveLength(1);

      // Too recent now: resume does nothing.
      Application.notify('resume');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(bank.requests).toHaveLength(1);

      // Deep links on iOS and Android reach handleRedirect only for the return address.
      const handleRedirect = vi.spyOn(fresh, 'handleRedirect').mockResolvedValue();
      const urls = [`${DEFAULT_REDIRECT_URL}?code=1`, 'https://elsewhere', null];
      Application.notify('sceneOpenURLContexts', {
        urlContexts: { allObjects: { count: urls.length, objectAtIndex: (i: number) => ({ URL: urls[i] === null ? null : { absoluteString: urls[i] } }) } },
      });
      expect(handleRedirect).toHaveBeenCalledTimes(1);
      expect(handleRedirect).toHaveBeenCalledWith(`${DEFAULT_REDIRECT_URL}?code=1`);

      const [, onIntent] = Application.android.on.mock.calls[0] as [string, (args: unknown) => void];
      onIntent({ intent: { getData: () => ({ toString: () => `${DEFAULT_REDIRECT_URL}?code=2` }) } });
      onIntent({ intent: { getData: () => null } });
      onIntent({ intent: undefined });
      expect(handleRedirect).toHaveBeenCalledTimes(2);
      expect(handleRedirect).toHaveBeenLastCalledWith(`${DEFAULT_REDIRECT_URL}?code=2`);
    });

    it('skips the automatic import while busy or not due, and survives missing deep links', async () => {
      Application.android.on.mockImplementationOnce(() => { throw new Error('no intents'); });
      const service = create();
      service.busy.set(true);
      service.start();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Deep links'), expect.any(Error));
      expect(Http.request).not.toHaveBeenCalled();
      service.busy.set(false);
      Application.notify('resume');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(Http.request).not.toHaveBeenCalled();
    });
  });
});
