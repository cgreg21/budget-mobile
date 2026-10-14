import { TestBed } from '@angular/core/testing';
import {
  CATEGORIES_BASELINE_KEY, DEFAULT_CALENDAR_CONFIG, DEFAULT_GENERAL_SETTINGS, categoriesToIcs, icsToCategories,
  icsToTransaction, transactionHash, transactionToIcs, type Category, type Transaction,
} from 'budget-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BudgetService } from '~/app/core/budget.service';
import { CalendarSyncService } from '~/app/core/calendar-sync.service';
import { fakeDatabase, seedDatabase, tx } from './helpers';
import { Application, Connectivity, Http, nsState } from './stubs/nativescript-core';
import { secureState } from './stubs/secure-storage';

const URL = 'https://cal.example.org/dav/budget/';
const CONFIG = { enabled: true, calendarUrl: URL, username: 'me' };
const NORMALIZED = { ...CONFIG, calendarUrl: URL.slice(0, -1) };

type Request = { method: string; url: string; headers: Record<string, string>; content?: string };
type Response = { statusCode: number; headers: Record<string, string>; content: { toString(): string } | null };

/** A tiny CalDAV server: one event per transaction, etags counting the versions. */
class FakeCalDav {
  events = new Map<string, { etag: number; ics: string }>();
  requests: Request[] = [];
  /** Status forced on every request (0 = behave normally). */
  forceStatus = 0;
  /** Makes the transport reject (offline). */
  offline = false;
  /** Every PUT answers 412 (the event changed meanwhile). */
  rejectPuts = false;

  put(transaction: Transaction): void {
    const href = `/dav/budget/${encodeURIComponent(transaction.id)}.ics`;
    this.events.set(href, { etag: (this.events.get(href)?.etag ?? 0) + 1, ics: transactionToIcs(transaction) });
  }

  transactions(): Transaction[] {
    return [...this.events.values()].map((event) => icsToTransaction(event.ics)).filter((t): t is Transaction => t !== null);
  }

  handle = async (request: Request): Promise<Response> => {
    this.requests.push(request);
    if (this.offline) throw new Error('Network unreachable');
    const reply = (statusCode: number, body = '', headers: Record<string, string> = {}): Response =>
      ({ statusCode, headers, content: body === '' ? null : { toString: () => body } });
    if (this.forceStatus) return reply(this.forceStatus, 'nope');
    const href = request.url.replace(/^https:\/\/cal\.example\.org/, '');
    switch (request.method) {
      case 'PROPFIND': return reply(207, '<d:multistatus/>');
      case 'REPORT': {
        const items = [...this.events].map(([path, event]) =>
          `<d:response><d:href>${path}</d:href><d:propstat><d:prop><d:getetag>"${event.etag}"</d:getetag>`
          + `<c:calendar-data><![CDATA[${event.ics}]]></c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
        return reply(207, `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${items.join('')}</d:multistatus>`);
      }
      case 'PUT': {
        const current = this.events.get(href);
        const ifMatch = request.headers['If-Match'];
        if (this.rejectPuts || (request.headers['If-None-Match'] === '*' && current)) return reply(412);
        if (ifMatch !== undefined && `"${current?.etag}"` !== ifMatch) return reply(412);
        const etag = (current?.etag ?? 0) + 1;
        this.events.set(href, { etag, ics: request.content ?? '' });
        return reply(201, '', { ETag: `"${etag}"` });
      }
      case 'DELETE': {
        const existed = this.events.delete(href);
        return reply(existed ? 204 : 404);
      }
      default: return reply(400);
    }
  };
}

describe('CalendarSyncService', () => {
  let server: FakeCalDav;

  const create = (): { calendar: CalendarSyncService; budget: BudgetService } => {
    TestBed.resetTestingModule();
    const budget = TestBed.inject(BudgetService);
    return { calendar: TestBed.inject(CalendarSyncService), budget };
  };

  const configured = (password = 'secret'): ReturnType<typeof create> => {
    nsState.settings.set('calendar-config', JSON.stringify(CONFIG));
    if (password !== '') secureState.values.set('calendar-password', password);
    return create();
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-15T10:30:00'));
    server = new FakeCalDav();
    Http.request.mockImplementation(server.handle as never);
    nsState.settings.set('general-settings', JSON.stringify({ ...DEFAULT_GENERAL_SETTINGS, language: 'fr' }));
    await seedDatabase({ months: { '2024-03': [tx('a'), tx('b', { date: '2024-03-02' })] } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('when disabled', () => {
    it('reports a disabled status and never syncs', async () => {
      const { calendar } = create();
      expect(calendar.config()).toEqual(DEFAULT_CALENDAR_CONFIG);
      expect(calendar.active()).toBe(false);
      expect(calendar.busy()).toBe(false);
      expect(calendar.status().state).toBe('disabled');
      expect(calendar.statusText()).toBe('Synchronisation d\u00e9sactiv\u00e9e');
      expect(calendar.details()).toContain('jamais');
      expect(calendar.hasPassword()).toBe(false);
      calendar.start();
      calendar.start();
      await calendar.syncNow();
      await vi.runAllTimersAsync();
      expect(Http.request).not.toHaveBeenCalled();
      expect(nsState.events.get('resume')?.size).toBe(1);
    });

    it('still tests the connection, leaving the state disabled', async () => {
      secureState.values.set('calendar-password', 'pw');
      nsState.settings.set('calendar-config', JSON.stringify({ ...CONFIG, enabled: false }));
      const { calendar } = create();
      await calendar.checkConnection();
      expect(calendar.status()).toMatchObject({ state: 'disabled', message: 'Connexion r\u00e9ussie.' });
      expect(server.requests[0].method).toBe('PROPFIND');
    });

    it('shows the invalid configuration when testing an incomplete one', async () => {
      const { calendar } = create();
      await calendar.checkConnection();
      expect(calendar.status().state).toBe('error');
      expect(calendar.status().message).toMatch(/adresse/i);
    });
  });

  describe('configure', () => {
    it('enables the calendar, stores the password and syncs after the debounce', async () => {
      const { calendar, budget } = create();
      calendar.start();
      calendar.configure(CONFIG, 'secret');
      expect(calendar.config()).toEqual(NORMALIZED);
      expect(calendar.status().state).toBe('offline');
      expect(secureState.values.get('calendar-password')).toBe('secret');
      expect(calendar.hasPassword()).toBe(true);
      expect(JSON.parse(nsState.settings.get('calendar-config')!)).toEqual(NORMALIZED);

      await vi.runAllTimersAsync();
      expect(calendar.status().state).toBe('online');
      expect(calendar.status().lastSync).toBe(new Date().toISOString());
      expect(server.transactions().map((t) => t.id).sort()).toEqual(['a', 'b']);
      const baseline = JSON.parse(nsState.settings.get('calendar-baseline')!);
      expect(Object.keys(baseline).sort()).toEqual(['@categories', 'a', 'b']);
      expect(baseline.a).toEqual({ href: `${URL}a.ics`, etag: '"1"', hash: transactionHash(tx('a')) });
      expect(calendar.details()).toBe('En ligne \u00b7 Derni\u00e8re synchronisation : 15/03/2024 10:30');

      // A local change is uploaded two seconds later.
      budget.add({ date: '2024-03-20', description: 'New', category: 'Autres', kind: 'expense', amount: 1 });
      await vi.advanceTimersByTimeAsync(1999);
      expect(server.transactions()).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      await vi.runAllTimersAsync();
      expect(server.transactions()).toHaveLength(3);
    });

    it('flags an incomplete configuration and drops the state when the account changes', async () => {
      const { calendar } = configured();
      nsState.settings.set('calendar-baseline', JSON.stringify({ a: { href: 'x', hash: 'y' } }));
      nsState.settings.set('calendar-last-sync', JSON.stringify('2024-01-01T00:00:00.000Z'));
      calendar.configure({ enabled: true, calendarUrl: ' ', username: 'other' }, null, false);
      expect(calendar.status()).toEqual({ state: 'error', lastSync: undefined, message: expect.stringMatching(/adresse/i) });
      expect(nsState.settings.has('calendar-last-sync')).toBe(false);
      expect(JSON.parse(nsState.settings.get('calendar-baseline')!)).toEqual({});
      expect(secureState.values.has('calendar-password')).toBe(false);
      await vi.runAllTimersAsync();
      expect(Http.request).not.toHaveBeenCalled();
    });

    it('keeps the state when only the password or the switch changes', async () => {
      const { calendar } = configured();
      calendar.start();
      await vi.runAllTimersAsync();
      const lastSync = calendar.status().lastSync;
      expect(lastSync).toBeDefined();

      calendar.configure(CONFIG, 'other', false);
      expect(secureState.values.get('calendar-password')).toBe('other');
      expect(calendar.status()).toEqual({ state: 'offline', lastSync, message: undefined });

      calendar.configure({ ...CONFIG, enabled: false }, null, false);
      expect(calendar.status().state).toBe('disabled');
      expect(calendar.active()).toBe(false);

      // Nothing changed: only a sync is requested.
      Http.request.mockClear();
      calendar.configure({ ...CONFIG, enabled: false }, null);
      await vi.runAllTimersAsync();
      expect(Http.request).not.toHaveBeenCalled();
      calendar.configure(CONFIG, null, false);
      calendar.configure(CONFIG, null);
      await vi.runAllTimersAsync();
      expect(Http.request).toHaveBeenCalled();
    });

    it('syncs when the configuration is unchanged but a sync is requested', async () => {
      const { calendar } = configured();
      calendar.configure(CONFIG, null);
      await vi.runAllTimersAsync();
      expect(server.requests.map((r) => r.method)).toContain('REPORT');
    });
  });

  describe('synchronisation', () => {
    it('downloads remote changes, deletes what the server dropped and reports skipped conflicts', async () => {
      server.put(tx('a', { amount: 99 }));
      server.put(tx('remote', { date: '2024-03-03', category: 'Fresh' }));
      nsState.settings.set('calendar-baseline', JSON.stringify({
        a: { href: `${URL}a.ics`, etag: '"0"', hash: transactionHash(tx('a')) },
        b: { href: `${URL}b.ics`, etag: '"1"', hash: transactionHash(tx('b', { date: '2024-03-02' })) },
        c: { href: `${URL}c.ics`, etag: '"1"', hash: 'gone' },
      }));
      const { calendar, budget } = configured();
      await calendar.syncNow();

      expect(calendar.status().state).toBe('online');
      expect(budget.transactions().map((t) => [t.id, t.amount])).toEqual([['a', 99], ['remote', 10]]);
      expect(budget.categories().some((c) => c.name === 'Fresh')).toBe(true);
      expect(fakeDatabase().rows('transactions').map((r) => r.id).sort()).toEqual(['a', 'remote']);
      expect(nsState.settings.get('calendar-baseline')).not.toContain('"c"');
    });

    describe('categories', () => {
      const putCategories = (list: Category[]): void => {
        server.events.set('/dav/budget/categories.ics', { etag: 1, ics: categoriesToIcs(list) });
      };
      const remoteList = (): Category[] | null => {
        const event = [...server.events.values()].map((e) => icsToCategories(e.ics)).find((c) => c !== null);
        return event ?? null;
      };

      it('stores the downloaded list without rewriting the transactions', async () => {
        putCategories([{ name: 'Zed', icon: 'z' }, { name: 'Autres', icon: 'o' }]);
        const { calendar, budget } = configured();
        const changes = vi.fn();
        budget.transactionsChanged.subscribe(changes);
        await calendar.syncNow();
        expect(budget.categories().slice(0, 2)).toEqual([{ name: 'Zed', icon: 'z' }, { name: 'Autres', icon: 'o' }]);
        expect(budget.categories().length).toBeGreaterThan(2);
        expect(fakeDatabase().rows('categories')[0].name).toBe('Zed');
        expect(changes).not.toHaveBeenCalled();
        expect(remoteList()?.map((c) => c.name)).toContain('Zed');
      });

      it('deduces categories from downloaded transactions', async () => {
        server.put(tx('remote', { date: '2024-03-03', category: 'Fresh' }));
        putCategories([{ name: 'Autres', icon: 'o' }]);
        const { calendar, budget } = configured();
        await calendar.syncNow();
        expect(budget.categories().some((c) => c.name === 'Fresh')).toBe(true);
        expect(remoteList()?.some((c) => c.name === 'Fresh')).toBe(true);
      });

      it('uploads the local list and tolerates its baseline entry', async () => {
        const { calendar, budget } = configured();
        calendar.start();
        await calendar.syncNow();
        const baseline = JSON.parse(nsState.settings.get('calendar-baseline')!);
        expect(baseline[CATEGORIES_BASELINE_KEY]).toMatchObject({ href: expect.any(String), hash: expect.any(String) });
        expect(remoteList()).toEqual(budget.categories());

        budget.addCategory('Mine', 'm');
        await vi.advanceTimersByTimeAsync(2000);
        await vi.runAllTimersAsync();
        expect(remoteList()?.at(-1)).toEqual({ name: 'Mine', icon: 'm' });

        // A reloaded service accepts the persisted baseline.
        const next = create();
        await next.calendar.syncNow();
        expect(next.calendar.status().state).toBe('online');
      });

      it('does not write the categories when the list is unchanged', async () => {
        const { calendar, budget } = configured();
        await calendar.syncNow();
        const spy = vi.spyOn(budget, 'applyCalendarCategories');
        await calendar.syncNow();
        expect(spy).not.toHaveBeenCalled();
      });
    });

    it('counts the conflicts the server refuses', async () => {
      server.rejectPuts = true;
      const { calendar } = configured();
      await calendar.syncNow();
      expect(calendar.status().state).toBe('online');
      expect(calendar.status().message).toMatch(/^3 conflit/);
    });

    it('reports a missing password', async () => {
      const { calendar } = configured('');
      await calendar.syncNow();
      expect(calendar.status()).toMatchObject({ state: 'error', message: expect.stringMatching(/mot de passe/i) });
    });

    it('goes offline on network failures and resumes on connectivity', async () => {
      server.offline = true;
      const { calendar } = configured();
      calendar.start();
      await vi.runAllTimersAsync();
      expect(calendar.status()).toMatchObject({ state: 'offline', message: expect.stringMatching(/connexion/i) });

      server.offline = false;
      const [monitor] = Connectivity.startMonitoring.mock.calls.at(-1)!;
      monitor(Connectivity.connectionType.none);
      await vi.runAllTimersAsync();
      expect(calendar.status().state).toBe('offline');
      monitor(Connectivity.connectionType.wifi);
      await vi.runAllTimersAsync();
      expect(calendar.status().state).toBe('online');

      Http.request.mockClear();
      Application.notify('resume');
      await vi.runAllTimersAsync();
      expect(Http.request).toHaveBeenCalled();
    });

    it('reports authentication and server errors', async () => {
      server.forceStatus = 401;
      const { calendar } = configured();
      await calendar.syncNow();
      expect(calendar.status()).toMatchObject({ state: 'error', message: expect.stringMatching(/authentification/i) });
      server.forceStatus = 500;
      await calendar.checkConnection();
      expect(calendar.status()).toMatchObject({ state: 'error', message: expect.stringContaining('500') });
    });

    it('reports unexpected failures, errors or not', async () => {
      const { calendar } = configured();
      Http.request.mockImplementation(() => Promise.resolve({ statusCode: 207, headers: null, content: null }));
      await calendar.syncNow();
      expect(calendar.status()).toMatchObject({ state: 'error', message: expect.stringMatching(/^La requ/) });
      Http.request.mockImplementation(() => { throw 'boom'; });
      await calendar.syncNow();
      expect(calendar.status()).toMatchObject({ state: 'error', message: expect.stringContaining('boom') });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('synchronization failed'), 'boom');
    });

    it('ignores the outcome of a run made obsolete by a configuration change', async () => {
      const { calendar } = configured();
      let release!: () => void;
      Http.request.mockImplementationOnce((request: Request) => new Promise<Response>((resolve) => {
        release = (): void => { void server.handle(request).then(resolve); };
      }));
      const running = calendar.syncNow();
      expect(calendar.busy()).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(release).toBeDefined();
      // A connection test requested while a sync runs joins the queue.
      const check = calendar.checkConnection();
      expect(check).toBe(running);
      calendar.configure({ ...CONFIG, username: 'someone-else' }, 'pw', false);
      release();
      await running;
      expect(calendar.status().state).toBe('offline');
      expect(calendar.status().lastSync).toBeUndefined();
      expect(server.requests.filter((r) => r.method === 'PROPFIND')).toHaveLength(0);
    });

    it('also drops an obsolete check and error', async () => {
      const { calendar } = configured();
      for (const status of [0, 401]) {
        server.forceStatus = status;
        Http.request.mockImplementationOnce((request: Request) => {
          calendar.configure({ ...CONFIG, username: `u${status}` }, 'pw', false);
          return server.handle(request);
        });
        await calendar.checkConnection();
        expect(calendar.status().message).toBeUndefined();
      }
    });

    it('runs a sync requested while another one is running', async () => {
      const { calendar } = configured();
      calendar.start();
      const first = calendar.syncNow();
      Application.notify('resume');
      await first;
      await vi.runAllTimersAsync();
      expect(server.requests.filter((r) => r.method === 'REPORT')).toHaveLength(2);
    });

    it('warns when connectivity monitoring is unavailable', () => {
      Connectivity.startMonitoring.mockImplementationOnce(() => { throw new Error('no connectivity'); });
      const { calendar } = configured();
      expect(() => calendar.start()).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('connectivity'), expect.any(Error));
    });

    it('ignores a corrupt stored baseline and last sync', () => {
      nsState.settings.set('calendar-baseline', JSON.stringify({ a: { href: 1 } }));
      nsState.settings.set('calendar-last-sync', JSON.stringify('not a date'));
      const { calendar } = configured();
      expect(calendar.status().lastSync).toBe('not a date');
      expect(calendar.details()).toContain('jamais');
      nsState.settings.set('calendar-baseline', JSON.stringify([1]));
      expect(create().calendar.status().state).toBe('offline');
    });
  });
});

