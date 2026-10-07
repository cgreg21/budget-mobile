import { SecureStorage } from '@nativescript/secure-storage';

const PASSWORD_KEY = 'remote-password';

let storage: SecureStorage | null | undefined;
// Used only when the native secure storage is missing from the running app: never written to disk.
let sessionPassword = '';

function secure(): SecureStorage | null {
  if (storage === undefined) {
    try {
      storage = new SecureStorage();
    } catch (error) {
      console.warn('Secure storage is unavailable, the password is kept for this session only:', error);
      storage = null;
    }
  }
  return storage;
}

/** Whether the password survives an app restart. */
export const isPasswordPersistent = (): boolean => secure() !== null;

export function readPassword(): string {
  const store = secure();
  if (store === null) return sessionPassword;
  try {
    const value: unknown = store.getSync({ key: PASSWORD_KEY });
    return typeof value === 'string' ? value : '';
  } catch {
    return sessionPassword;
  }
}

export function writePassword(password: string): void {
  sessionPassword = password;
  const store = secure();
  if (store === null) return;
  try {
    if (password === '') store.removeSync({ key: PASSWORD_KEY });
    else store.setSync({ key: PASSWORD_KEY, value: password });
  } catch (error) {
    console.warn('The password could not be saved securely:', error);
  }
}
