import { ApplicationSettings } from '@nativescript/core';

/** Reads a JSON value saved under `key`; falls back when absent, corrupt or rejected by the guard. */
export function readJson<T>(key: string, guard: (value: unknown) => value is T, fallback: () => T): T {
  const raw = ApplicationSettings.getString(key, '');
  if (raw === '') return fallback();
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback();
  } catch {
    return fallback();
  }
}

export function writeJson(key: string, value: unknown): void {
  ApplicationSettings.setString(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  ApplicationSettings.remove(key);
}

export function allKeys(): string[] {
  return ApplicationSettings.getAllKeys();
}

export function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
