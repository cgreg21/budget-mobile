/* In-memory `@nativescript/secure-storage`; `secureState.failing` makes every call throw. */
type SecureState = { values: Map<string, string>; failing: boolean };
const g = globalThis as unknown as { __secureState?: SecureState };
export const secureState: SecureState = g.__secureState ??= { values: new Map(), failing: false };

export function resetSecureStorage(): void {
  secureState.values.clear();
  secureState.failing = false;
}

export class SecureStorage {
  constructor() {
    if (secureState.failing) throw new Error('Secure storage unavailable');
  }
  getSync({ key }: { key: string }): string | null {
    if (secureState.failing) throw new Error('Secure storage unavailable');
    return secureState.values.get(key) ?? null;
  }
  setSync({ key, value }: { key: string; value: string }): boolean {
    if (secureState.failing) throw new Error('Secure storage unavailable');
    secureState.values.set(key, value);
    return true;
  }
  removeSync({ key }: { key: string }): boolean {
    if (secureState.failing) throw new Error('Secure storage unavailable');
    return secureState.values.delete(key);
  }
}
