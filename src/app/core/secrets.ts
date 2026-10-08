import { SecureStorage } from '@nativescript/secure-storage';

const PASSWORD_KEY = 'remote-password';
const BANK_KEY_KEY = 'bank-private-key';

let storage: SecureStorage | null | undefined;
// Used only when the native secure storage is missing from the running app: never written to disk.
const sessionSecrets = new Map<string, string>();

function secure(): SecureStorage | null {
  if (storage === undefined) {
    try {
      storage = new SecureStorage();
    } catch (error) {
      console.warn('Secure storage is unavailable, secrets are kept for this session only:', error);
      storage = null;
    }
  }
  return storage;
}

/** Whether the secrets survive an app restart. */
export const isPasswordPersistent = (): boolean => secure() !== null;

function readSecret(key: string): string {
  const store = secure();
  if (store === null) return sessionSecrets.get(key) ?? '';
  try {
    const value: unknown = store.getSync({ key });
    return typeof value === 'string' ? value : '';
  } catch {
    return sessionSecrets.get(key) ?? '';
  }
}

function writeSecret(key: string, value: string): void {
  sessionSecrets.set(key, value);
  const store = secure();
  if (store === null) return;
  try {
    if (value === '') store.removeSync({ key });
    else store.setSync({ key, value });
  } catch (error) {
    console.warn('A secret could not be saved securely:', error);
  }
}

export const readPassword = (): string => readSecret(PASSWORD_KEY);
export const writePassword = (password: string): void => writeSecret(PASSWORD_KEY, password);

export const readBankKey = (): string => readSecret(BANK_KEY_KEY);
export const writeBankKey = (privateKey: string): void => writeSecret(BANK_KEY_KEY, privateKey);