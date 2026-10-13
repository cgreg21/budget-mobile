import { TestBed } from '@angular/core/testing';
import { KJUR, KEYUTIL } from 'jsrsasign';
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { nativeBankHttp, rsaSigner } from '~/app/core/bank/platform';
import { CalendarNetworkError, nativeCalendarHttp } from '~/app/core/calendar-transport';
import { DrawerService } from '~/app/core/drawer.service';
import { Http, makeRootView, nsState } from './stubs/nativescript-core';
import { secureState } from './stubs/secure-storage';

type SecretsModule = typeof import('~/app/core/secrets');

describe('DrawerService', () => {
  it('drives the side drawer when it is the root view', () => {
    const service = TestBed.inject(DrawerService);
    expect(() => { service.show(); service.close(); }).not.toThrow();
    const root = Object.assign(makeRootView(), { showDrawer: vi.fn(), closeDrawer: vi.fn() });
    nsState.rootView = root;
    service.show();
    service.close();
    expect(root.showDrawer).toHaveBeenCalledTimes(1);
    expect(root.closeDrawer).toHaveBeenCalledTimes(1);
  });
});

describe('secrets', () => {
  /** The module caches the storage instance: load it anew for each scenario. */
  const load = async (): Promise<SecretsModule> => {
    vi.resetModules();
    return import('~/app/core/secrets');
  };

  it('keeps secrets in the secure storage', async () => {
    const secrets = await load();
    expect(secrets.isCalendarPasswordPersistent()).toBe(true);
    expect(secrets.readCalendarPassword()).toBe('');
    secrets.writeCalendarPassword('pw');
    secrets.writeBankKey('key');
    expect(secureState.values.get('calendar-password')).toBe('pw');
    expect(secrets.readCalendarPassword()).toBe('pw');
    expect(secrets.readBankKey()).toBe('key');
    secrets.writeBankKey('');
    expect(secureState.values.has('bank-private-key')).toBe(false);
    expect(secrets.readBankKey()).toBe('');
  });

  it('ignores non-string values returned by the store', async () => {
    const secrets = await load();
    secureState.values.set('calendar-password', 42 as unknown as string);
    expect(secrets.readCalendarPassword()).toBe('');
  });

  it('falls back to the session when the secure storage cannot be created', async () => {
    secureState.failing = true;
    const secrets = await load();
    expect(secrets.isCalendarPasswordPersistent()).toBe(false);
    expect(secrets.readCalendarPassword()).toBe('');
    secrets.writeCalendarPassword('session-only');
    expect(secrets.readCalendarPassword()).toBe('session-only');
    expect(secureState.values.size).toBe(0);
  });

  it('falls back to the session when the store fails after creation', async () => {
    const secrets = await load();
    expect(secrets.isCalendarPasswordPersistent()).toBe(true);
    secureState.failing = true;
    secrets.writeCalendarPassword('pw');
    expect(secrets.readCalendarPassword()).toBe('pw');
    secureState.failing = false;
    expect(secureState.values.has('calendar-password')).toBe(false);
  });
});

describe('nativeCalendarHttp', () => {
  it('maps the NativeScript response, lower-casing header names', async () => {
    Http.request.mockResolvedValue({ statusCode: 207, headers: { ETag: '"1"', 'Content-Type': 'text/xml' }, content: { toString: () => '<xml/>' } });
    const response = await nativeCalendarHttp({ method: 'REPORT', url: 'https://cal/x', headers: { Depth: '1' }, body: '<q/>' });
    expect(response).toEqual({ status: 207, headers: { etag: '"1"', 'content-type': 'text/xml' }, body: '<xml/>' });
    expect(Http.request).toHaveBeenCalledWith({ method: 'REPORT', url: 'https://cal/x', headers: { Depth: '1' }, content: '<q/>', timeout: 20000 });
  });

  it('sends no content without a body and reads an empty body', async () => {
    Http.request.mockResolvedValue({ statusCode: 204, headers: {}, content: null });
    const response = await nativeCalendarHttp({ method: 'DELETE', url: 'https://cal/x', headers: {} });
    expect(response.body).toBe('');
    expect(Http.request.mock.calls[0][0]).not.toHaveProperty('content');
  });

  it('turns transport failures into CalendarNetworkError', async () => {
    Http.request.mockRejectedValue(new Error('timeout'));
    await expect(nativeCalendarHttp({ method: 'GET', url: 'u', headers: {} })).rejects.toBeInstanceOf(CalendarNetworkError);
    Http.request.mockRejectedValue('offline');
    await expect(nativeCalendarHttp({ method: 'GET', url: 'u', headers: {} })).rejects.toThrow('offline');
  });
});

describe('bank platform', () => {
  it('sends requests through NativeScript and returns the status and body', async () => {
    Http.request.mockResolvedValue({ statusCode: 200, content: { toString: () => '{"ok":true}' } });
    const response = await nativeBankHttp({ method: 'POST', url: 'https://api/x', headers: { A: 'b' }, body: '{}', timeoutMs: 5 });
    expect(response).toEqual({ status: 200, body: '{"ok":true}' });
    expect(Http.request).toHaveBeenCalledWith({ url: 'https://api/x', method: 'POST', headers: { A: 'b' }, timeout: 5, content: '{}' });

    Http.request.mockResolvedValue({ statusCode: 500, content: null });
    expect(await nativeBankHttp({ method: 'GET', url: 'u', headers: {}, timeoutMs: 1 })).toEqual({ status: 500, body: '' });
    expect(Http.request.mock.calls[1][0]).not.toHaveProperty('content');
  });

  it('signs RS256 tokens that verify with the public key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 1024,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const token = rsaSigner({ alg: 'RS256', typ: 'JWT' }, { iss: 'app', exp: 2 }, privateKey);
    expect(token.split('.')).toHaveLength(3);
    expect(KJUR.jws.JWS.verify(token, KEYUTIL.getKey(publicKey) as never, ['RS256'])).toBe(true);
  });
});
