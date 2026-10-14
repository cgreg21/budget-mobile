/*
 * core/config-cipher.ts - the cryptography of the encrypted configuration file on the phone.
 * The NativeScript runtime has no WebCrypto. AES-256-CBC comes from the CryptoJS bundled in
 * jsrsasign (already used for the bank's RS256 signatures); SHA-256, HMAC and PBKDF2 are written
 * here on typed arrays, because CryptoJS's PBKDF2 takes minutes for the 100 000 rounds of the
 * file format. Random bytes come from the platform: CryptoJS's own `WordArray.random` uses
 * `Math.random`, which is not good enough for a salt or an IV.
 */
import type { ConfigCipher } from 'budget-lib';
import * as jsrsasign from 'jsrsasign';

/** CryptoJS's byte container: big-endian 32-bit words, `sigBytes` of them significant. */
export interface WordArray {
  words: number[];
  sigBytes: number;
}

interface CryptoJsLike {
  lib: { WordArray: { create(words: number[], sigBytes: number): WordArray } };
  mode: { CBC: unknown };
  pad: { Pkcs7: unknown };
  AES: {
    encrypt(message: WordArray, key: WordArray, cfg: object): { ciphertext: WordArray };
    decrypt(params: { ciphertext: WordArray }, key: WordArray, cfg: object): WordArray;
  };
}

// @types/jsrsasign does not declare the bundled CryptoJS; the runtime object has it.
const CryptoJS = (jsrsasign as unknown as { CryptoJS: CryptoJsLike }).CryptoJS;

const AES_BLOCK = 16;
const SHA256_BLOCK = 64;
const SHA256_LENGTH = 32;

export function bytesToWordArray(bytes: Uint8Array): WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

export function wordArrayToBytes(array: WordArray): Uint8Array {
  const bytes = new Uint8Array(array.sigBytes);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (array.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  return bytes;
}

/* ---- SHA-256 (FIPS 180-4), incremental, on typed arrays ---- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

class Sha256 {
  private readonly state = new Uint32Array(INITIAL_STATE);
  private readonly block = new Uint8Array(SHA256_BLOCK);
  private readonly schedule = new Uint32Array(64);
  private filled = 0;
  private total = 0;

  /** A copy of the current state: HMAC absorbs its padded keys once and clones from there. */
  clone(): Sha256 {
    const copy = new Sha256();
    copy.state.set(this.state);
    copy.block.set(this.block);
    copy.filled = this.filled;
    copy.total = this.total;
    return copy;
  }

  update(data: Uint8Array): this {
    this.total += data.length;
    let offset = 0;
    if (this.filled > 0) {
      const take = Math.min(SHA256_BLOCK - this.filled, data.length);
      this.block.set(data.subarray(0, take), this.filled);
      this.filled += take;
      offset = take;
      if (this.filled < SHA256_BLOCK) return this;
      this.compress(this.block, 0);
      this.filled = 0;
    }
    for (; offset + SHA256_BLOCK <= data.length; offset += SHA256_BLOCK) this.compress(data, offset);
    if (offset < data.length) {
      this.block.set(data.subarray(offset));
      this.filled = data.length - offset;
    }
    return this;
  }

  digest(): Uint8Array {
    const bits = this.total * 8;
    this.block[this.filled++] = 0x80;
    if (this.filled > SHA256_BLOCK - 8) {
      this.block.fill(0, this.filled);
      this.compress(this.block, 0);
      this.filled = 0;
    }
    this.block.fill(0, this.filled, SHA256_BLOCK - 8);
    // The bit length fits 53 bits: split it without BigInt.
    const high = Math.floor(bits / 0x100000000);
    const low = bits >>> 0;
    for (let i = 0; i < 4; i++) {
      this.block[SHA256_BLOCK - 8 + i] = (high >>> (24 - i * 8)) & 0xff;
      this.block[SHA256_BLOCK - 4 + i] = (low >>> (24 - i * 8)) & 0xff;
    }
    this.compress(this.block, 0);
    const out = new Uint8Array(SHA256_LENGTH);
    for (let i = 0; i < 8; i++) {
      out[i * 4] = this.state[i] >>> 24;
      out[i * 4 + 1] = (this.state[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (this.state[i] >>> 8) & 0xff;
      out[i * 4 + 3] = this.state[i] & 0xff;
    }
    return out;
  }

  private compress(data: Uint8Array, offset: number): void {
    const w = this.schedule;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    const s = this.state;
    let a = s[0], b = s[1], c = s[2], d = s[3], e = s[4], f = s[5], g = s[6], h = s[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    s[0] = (s[0] + a) | 0; s[1] = (s[1] + b) | 0; s[2] = (s[2] + c) | 0; s[3] = (s[3] + d) | 0;
    s[4] = (s[4] + e) | 0; s[5] = (s[5] + f) | 0; s[6] = (s[6] + g) | 0; s[7] = (s[7] + h) | 0;
  }
}

export function sha256(data: Uint8Array): Uint8Array {
  return new Sha256().update(data).digest();
}

/** HMAC-SHA256 with the key absorbed once: `sign` is cheap enough to call 100 000 times. */
class HmacSha256 {
  private readonly inner: Sha256;
  private readonly outer: Sha256;

  constructor(key: Uint8Array) {
    const normalized = key.length > SHA256_BLOCK ? sha256(key) : key;
    const pad = new Uint8Array(SHA256_BLOCK);
    pad.set(normalized);
    for (let i = 0; i < SHA256_BLOCK; i++) pad[i] ^= 0x36;
    this.inner = new Sha256().update(pad);
    for (let i = 0; i < SHA256_BLOCK; i++) pad[i] ^= 0x36 ^ 0x5c;
    this.outer = new Sha256().update(pad);
  }

  sign(...parts: Uint8Array[]): Uint8Array {
    const inner = this.inner.clone();
    for (const part of parts) inner.update(part);
    return this.outer.clone().update(inner.digest()).digest();
  }
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new HmacSha256(key).sign(data);
}

/** PBKDF2 with HMAC-SHA256 (RFC 8018), `length` bytes of output. */
export function pbkdf2Sha256(passphrase: Uint8Array, salt: Uint8Array, iterations: number, length: number): Uint8Array {
  const hmac = new HmacSha256(passphrase);
  const out = new Uint8Array(length);
  const counter = new Uint8Array(4);
  for (let block = 1, offset = 0; offset < length; block++, offset += SHA256_LENGTH) {
    counter[0] = block >>> 24; counter[1] = (block >>> 16) & 0xff; counter[2] = (block >>> 8) & 0xff; counter[3] = block & 0xff;
    let u = hmac.sign(salt, counter);
    const t = new Uint8Array(u);
    for (let i = 1; i < iterations; i++) {
      u = hmac.sign(u);
      for (let j = 0; j < SHA256_LENGTH; j++) t[j] ^= u[j];
    }
    out.set(t.subarray(0, Math.min(SHA256_LENGTH, length - offset)), offset);
  }
  return out;
}

type Platform = {
  java?: { security: { SecureRandom: new () => { nextBytes(buffer: number[]): void } } };
  Array: { create?: (type: string, length: number) => number[] };
  arc4random_uniform?: (bound: number) => number;
  crypto?: { getRandomValues?: <T extends Uint8Array>(array: T) => T };
};

/**
 * Random bytes from the operating system: `SecureRandom` on Android, `arc4random` on iOS,
 * WebCrypto elsewhere (the tests). Never `Math.random`; throws when no source is available.
 */
export function secureRandomBytes(length: number): Uint8Array {
  const platform = globalThis as unknown as Platform;
  const bytes = new Uint8Array(length);
  if (platform.java !== undefined && typeof platform.Array.create === 'function') {
    const buffer = platform.Array.create('byte', length);
    new platform.java.security.SecureRandom().nextBytes(buffer);
    for (let i = 0; i < length; i++) bytes[i] = buffer[i] & 0xff;
    return bytes;
  }
  if (typeof platform.arc4random_uniform === 'function') {
    for (let i = 0; i < length; i++) bytes[i] = platform.arc4random_uniform(256);
    return bytes;
  }
  if (typeof platform.crypto?.getRandomValues === 'function') return platform.crypto.getRandomValues(bytes);
  throw new Error('No secure random source is available');
}

const cbc = (iv: Uint8Array): object => ({ iv: bytesToWordArray(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });

/** The `ConfigCipher` of the phone. */
export const nativeConfigCipher: ConfigCipher = {
  randomBytes: secureRandomBytes,

  pbkdf2Sha256(passphrase, salt, iterations, length) {
    return Promise.resolve(pbkdf2Sha256(passphrase, salt, iterations, length));
  },

  aesCbcEncrypt(key, iv, plaintext) {
    const { ciphertext } = CryptoJS.AES.encrypt(bytesToWordArray(plaintext), bytesToWordArray(key), cbc(iv));
    return Promise.resolve(wordArrayToBytes(ciphertext));
  },

  aesCbcDecrypt(key, iv, ciphertext) {
    // CryptoJS does not report a bad padding: check the shape of the input and of what comes out.
    if (ciphertext.length === 0 || ciphertext.length % AES_BLOCK !== 0) return Promise.reject(new Error('Invalid ciphertext length'));
    const plain = CryptoJS.AES.decrypt({ ciphertext: bytesToWordArray(ciphertext) }, bytesToWordArray(key), cbc(iv));
    const removed = ciphertext.length - plain.sigBytes;
    if (removed < 1 || removed > AES_BLOCK) return Promise.reject(new Error('Invalid padding'));
    return Promise.resolve(wordArrayToBytes(plain));
  },

  hmacSha256(key, data) {
    return Promise.resolve(hmacSha256(key, data));
  },
};
