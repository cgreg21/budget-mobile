import { describe, expect, it } from 'vitest';

import { STRINGS, type Strings } from '~/app/core/i18n';

type Tree = Record<string, unknown>;

/** Every dotted path of the tree, with the kind of leaf it ends on. */
function shape(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [`${prefix}:array(${value.length})`];
  if (typeof value === 'function') return [`${prefix}:fn(${value.length})`];
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Tree).sort().flatMap((key) => shape((value as Tree)[key], prefix ? `${prefix}.${key}` : key));
  }
  return [`${prefix}:${typeof value}`];
}

/** Representative arguments for a function-valued string, from its arity. */
const SAMPLE_ARGS: unknown[][] = [[0, 'x', 'y'], [1, 'a', 'b'], [42, 'many', 'more']];

function functions(value: unknown, path = ''): { path: string; fn: (...args: unknown[]) => unknown }[] {
  if (typeof value === 'function') return [{ path, fn: value as (...args: unknown[]) => unknown }];
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.entries(value as Tree).flatMap(([key, entry]) => functions(entry, path ? `${path}.${key}` : key));
  }
  return [];
}

function strings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((entry, index) => strings(entry, `${path}[${index}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Tree).flatMap(([key, entry]) => strings(entry, path ? `${path}.${key}` : key));
  }
  return [];
}

describe('i18n', () => {
  const languages = Object.keys(STRINGS) as (keyof typeof STRINGS)[];

  it('provides French and English', () => {
    expect(languages.sort()).toEqual(['en', 'fr']);
  });

  it('has the same keys, arities and array lengths in both languages', () => {
    expect(shape(STRINGS.fr)).toEqual(shape(STRINGS.en));
  });

  it.each(languages)('%s: every plain string is non-empty', (language) => {
    for (const { path, text } of strings(STRINGS[language])) {
      expect(text.trim(), path).not.toBe('');
    }
  });

  it.each(languages)('%s: every function-valued string returns a non-empty string', (language) => {
    const list = functions(STRINGS[language]);
    expect(list.length).toBeGreaterThan(10);
    for (const { path, fn } of list) {
      for (const args of SAMPLE_ARGS) {
        // Arguments are positional: numbers first for counts, text otherwise.
        const ordered = path.match(/recurrences\.(range)$/) ? ['Jan', 'Dec', args[0]] : path.endsWith('connectedStatus') ? ['Bank', args[0]] : args;
        const result = fn(...ordered);
        expect(typeof result, path).toBe('string');
        expect((result as string).trim(), `${path}(${JSON.stringify(ordered)})`).not.toBe('');
      }
    }
  });

  it('pluralises the counts in both languages', () => {
    const check = (t: Strings): void => {
      expect(t.calendar.skipped(1)).not.toBe(t.calendar.skipped(2));
      expect(t.bank.imported(0)).not.toBe(t.bank.imported(1));
      expect(t.bank.imported(2)).toContain('2');
      expect(t.bank.connectedStatus('B', 1)).not.toBe(t.bank.connectedStatus('B', 2));
      expect(t.recurrences.dayOf(1)).toContain('1');
      expect(t.recurrences.range('Jan', 'Dec', 12)).toContain('12');
    };
    check(STRINGS.fr);
    check(STRINGS.en);
  });

  it('has twelve month names', () => {
    expect(STRINGS.fr.months).toHaveLength(12);
    expect(STRINGS.en.months[0]).toBe('January');
    expect(STRINGS.fr.months[0]).toBe('Janvier');
  });
});
