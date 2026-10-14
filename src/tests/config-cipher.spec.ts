import {
  CONFIG_KDF_ITERATIONS, ConfigFileError, emptyConfigData, openConfig, sealConfig, utf8Encode, webCryptoConfigCipher,
  type ConfigData, type WebCryptoLike,
} from 'budget-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bytesToWordArray, nativeConfigCipher, secureRandomBytes, sha256, wordArrayToBytes } from '~/app/core/config-cipher';

// DOM's `Crypto` typing is stricter than the library's structural `WebCryptoLike`; the runtime object fits.
const webCipher = webCryptoConfigCipher(globalThis.crypto as unknown as WebCryptoLike);
const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const hex = (array: Uint8Array): string => [...array].map((b) => b.toString(16).padStart(2, '0')).join('');

const sample = (): ConfigData => ({
  ...emptyConfigData(),
  general: { language: 'fr', currency: 'CHF', dateFormat: 'yyyy-mm-dd', amountFormat: 'comma-dot', theme: 'light' },
  thresholds: { low: 10, medium: 20, high: 30 },
  calendar: { enabled: true, calendarUrl: 'https://cal.example/u/b', username: 'me', proxyUrl: '', password: 'p\u00e2ss w\u00f6rd \u20ac' },
  bank: {
    config: { applicationId: 'app', bankName: 'Bank', bankCountry: 'FR', bankConsentSeconds: 100, redirectUrl: 'budgetmobile://bank', importFrom: '2024-01-01' },
    privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  },
});

describe('config-cipher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Array as unknown as { create?: unknown }).create;
  });

  it('converts bytes to word arrays and back, whatever the length', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 7, 8, 13, 16, 33]) {
      const input = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff);
      const array = bytesToWordArray(input);
      expect(array.sigBytes).toBe(length);
      expect(array.words.length).toBe(Math.ceil(length / 4));
      expect(wordArrayToBytes(array)).toEqual(input);
    }
    expect(bytesToWordArray(bytes(0x01, 0x02, 0x03, 0x04, 0xff)).words).toEqual([0x01020304, 0xff000000 | 0]);
  });

  it('hashes like SHA-256 for every padding case', async () => {
    expect(hex(sha256(utf8Encode('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(utf8Encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(utf8Encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    // Lengths around the block boundary (55, 56, 63, 64, 65 bytes) and a long message, against Node.
    for (const length of [55, 56, 63, 64, 65, 119, 120, 1000]) {
      const data = Uint8Array.from({ length }, (_, i) => (i * 131) & 0xff);
      const expected = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
      expect(hex(sha256(data)), String(length)).toBe(hex(expected));
    }
  });

  it('derives the same PBKDF2-SHA256 key as WebCrypto', async () => {
    const passphrase = utf8Encode('correct horse battery staple');
    const salt = bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
    for (const length of [20, 32, 64]) {
      const ours = await nativeConfigCipher.pbkdf2Sha256(passphrase, salt, 1000, length);
      const theirs = await webCipher.pbkdf2Sha256(passphrase, salt, 1000, length);
      expect(ours).toHaveLength(length);
      expect(hex(ours)).toBe(hex(theirs));
    }
    // Salts around the hash block size exercise the buffering of a partly filled block.
    for (const saltLength of [60, 62, 70, 130]) {
      const longSalt = Uint8Array.from({ length: saltLength }, (_, i) => i);
      expect(hex(await nativeConfigCipher.pbkdf2Sha256(passphrase, longSalt, 3, 40)))
        .toBe(hex(await webCipher.pbkdf2Sha256(passphrase, longSalt, 3, 40)));
    }
    // RFC 7914 / well-known PBKDF2-HMAC-SHA256 vector: "password", "salt", 1 iteration, 32 bytes.
    const known = await nativeConfigCipher.pbkdf2Sha256(utf8Encode('password'), utf8Encode('salt'), 1, 32);
    expect(hex(known)).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  });

  it('computes HMAC-SHA256 like WebCrypto', async () => {
    const key = webCipher.randomBytes(32);
    const data = utf8Encode('some data to authenticate');
    expect(hex(await nativeConfigCipher.hmacSha256(key, data))).toBe(hex(await webCipher.hmacSha256(key, data)));
    // RFC 4231 test case 2, and a key longer than a block (test case 6).
    expect(hex(await nativeConfigCipher.hmacSha256(utf8Encode('Jefe'), utf8Encode('what do ya want for nothing?'))))
      .toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    const longKey = new Uint8Array(131).fill(0xaa);
    expect(hex(await nativeConfigCipher.hmacSha256(longKey, utf8Encode('Test Using Larger Than Block-Size Key - Hash Key First'))))
      .toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
    const message = Uint8Array.from({ length: 300 }, (_, i) => i & 0xff);
    expect(hex(await nativeConfigCipher.hmacSha256(longKey, message))).toBe(hex(await webCipher.hmacSha256(longKey, message)));
  });

  it('encrypts and decrypts AES-256-CBC interoperably with WebCrypto', async () => {
    const key = webCipher.randomBytes(32);
    const iv = webCipher.randomBytes(16);
    for (const length of [0, 1, 15, 16, 17, 100]) {
      const plaintext = Uint8Array.from({ length }, (_, i) => i & 0xff);
      const ours = await nativeConfigCipher.aesCbcEncrypt(key, iv, plaintext);
      const theirs = await webCipher.aesCbcEncrypt(key, iv, plaintext);
      expect(hex(ours)).toBe(hex(theirs));
      expect(await nativeConfigCipher.aesCbcDecrypt(key, iv, theirs)).toEqual(plaintext);
      expect(await webCipher.aesCbcDecrypt(key, iv, ours)).toEqual(plaintext);
    }
  });

  it('refuses ciphertexts of the wrong length and bad paddings', async () => {
    const key = webCipher.randomBytes(32);
    const iv = webCipher.randomBytes(16);
    await expect(nativeConfigCipher.aesCbcDecrypt(key, iv, new Uint8Array(0))).rejects.toThrow('length');
    await expect(nativeConfigCipher.aesCbcDecrypt(key, iv, new Uint8Array(17))).rejects.toThrow('length');
    // A random block decrypts to random bytes: the padding is almost surely invalid.
    const garbage = bytes(...Array.from({ length: 16 }, (_, i) => i * 7));
    let rejected = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      garbage[0] = attempt;
      await nativeConfigCipher.aesCbcDecrypt(key, iv, garbage).then(() => undefined, () => { rejected++; });
    }
    expect(rejected).toBeGreaterThan(0);
  });

  it('round-trips a configuration through the library', async () => {
    const data = sample();
    const text = await sealConfig(data, 'a strong passphrase', nativeConfigCipher, { iterations: 500 });
    expect(JSON.parse(text).kdf.iterations).toBe(500);
    expect(text).not.toContain('cal.example');
    expect(await openConfig(text, 'a strong passphrase', nativeConfigCipher)).toMatchObject(data);
    await expect(openConfig(text, 'a wrong passphrase', nativeConfigCipher)).rejects.toMatchObject({ code: 'passphrase' });
    await expect(sealConfig(data, 'short', nativeConfigCipher)).rejects.toBeInstanceOf(ConfigFileError);
  });

  it('opens files sealed by WebCrypto, and the reverse', async () => {
    const data = sample();
    const fromWeb = await sealConfig(data, 'passphrase one', webCipher, { iterations: 500 });
    expect(await openConfig(fromWeb, 'passphrase one', nativeConfigCipher)).toMatchObject(data);
    const fromPhone = await sealConfig(data, 'passphrase two', nativeConfigCipher, { iterations: 500 });
    expect(await openConfig(fromPhone, 'passphrase two', webCipher)).toMatchObject(data);
  });

  it('uses the default iteration count within a reasonable time', async () => {
    const text = await sealConfig(emptyConfigData(), 'default rounds', nativeConfigCipher);
    expect(JSON.parse(text).kdf.iterations).toBe(CONFIG_KDF_ITERATIONS);
    expect(await openConfig(text, 'default rounds', webCipher)).toMatchObject(emptyConfigData());
  }, 20_000);

  it('draws random bytes from the platform, never from Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const first = secureRandomBytes(16);
    const second = secureRandomBytes(16);
    expect(first).toHaveLength(16);
    expect(hex(first)).not.toBe(hex(second));

    // Android: java.security.SecureRandom into a byte[] (signed bytes).
    (Array as unknown as { create: unknown }).create = (_type: string, length: number) => new Array<number>(length).fill(0);
    vi.stubGlobal('java', { security: { SecureRandom: class { nextBytes(buffer: number[]): void { buffer.fill(-1); buffer[0] = 5; } } } });
    expect([...secureRandomBytes(3)]).toEqual([5, 255, 255]);
    vi.unstubAllGlobals();
    delete (Array as unknown as { create?: unknown }).create;

    // iOS: arc4random_uniform per byte.
    vi.stubGlobal('arc4random_uniform', (bound: number) => bound - 1);
    expect([...secureRandomBytes(2)]).toEqual([255, 255]);
    vi.unstubAllGlobals();

    vi.stubGlobal('crypto', undefined);
    expect(() => secureRandomBytes(4)).toThrow('No secure random source');
    expect(random).not.toHaveBeenCalled();
  });
});
