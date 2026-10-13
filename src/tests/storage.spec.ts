import { describe, expect, it } from 'vitest';

import { allKeys, createId, readJson, removeKey, writeJson } from '~/app/core/storage';
import { nsState } from './stubs/nativescript-core';

const isNumber = (value: unknown): value is number => typeof value === 'number';

describe('storage', () => {
  it('round-trips JSON values', () => {
    writeJson('n', 42);
    expect(readJson('n', isNumber, () => 0)).toBe(42);
    expect(allKeys()).toEqual(['n']);
    removeKey('n');
    expect(allKeys()).toEqual([]);
  });

  it('falls back when the key is absent, corrupt or rejected by the guard', () => {
    expect(readJson('missing', isNumber, () => -1)).toBe(-1);
    nsState.settings.set('corrupt', '{not json');
    expect(readJson('corrupt', isNumber, () => -2)).toBe(-2);
    writeJson('wrong', 'text');
    expect(readJson('wrong', isNumber, () => -3)).toBe(-3);
  });

  it('creates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, createId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]+$/);
  });
});
