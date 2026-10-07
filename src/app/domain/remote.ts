/*
 * domain/remote.ts — what it means for the budget to be mirrored on a remote
 * WebDAV server (an Infomaniak kDrive, typically).
 *
 * The file layout is the one of the desktop budget-app, so that both
 * applications can share the same directory:
 *
 *   <remoteDir>/categories.json  thresholds.json  recurrences.json
 *   <remoteDir>/months/YYYY-MM.json
 *
 * Unlike the desktop, the mobile app stays editable without a connection: the
 * changes are kept and reconciled with the server on the next synchronisation.
 * The password is never part of `RemoteConfig`: it lives in the secure storage.
 * The remote can also be iCloud Drive (iOS only), which needs no address nor
 * password: the files then live in the app's iCloud container.
 */
import { isMonthKey, type MonthKey } from './month';

export type RemoteProvider = 'webdav' | 'icloud';

export interface RemoteConfig {
  provider: RemoteProvider;
  /** Root address of the server, e.g. `https://12345.connect.kdrive.infomaniak.com`. */
  baseUrl: string;
  username: string;
  /** Directory holding the budget on that server, relative to `baseUrl`. */
  remoteDir: string;
  enabled: boolean;
}

/** What is read back from the storage: configs saved before iCloud have no provider. */
export type StoredRemoteConfig = Omit<RemoteConfig, 'provider'> & { provider?: RemoteProvider };

export const DEFAULT_REMOTE_DIR = 'budget-app';

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  provider: 'webdav',
  baseUrl: '',
  username: '',
  remoteDir: DEFAULT_REMOTE_DIR,
  enabled: false,
};

/**
 *   disabled    no remote configured
 *   connecting  reaching the server
 *   syncing     exchanging files
 *   online      local data and server are in step
 *   offline     unreachable; changes are kept until the server answers again
 *   error       reached and refused — wrong address, credentials or rights
 */
export type SyncState = 'disabled' | 'connecting' | 'syncing' | 'online' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Why it went wrong, ready to be shown as-is. */
  message?: string;
  /** When the last complete synchronisation ended, ISO. */
  lastSyncedAt?: string;
  /** Number of files changed locally and not yet sent. */
  pending: number;
}

export const SETTINGS_FILES = ['categories.json', 'thresholds.json', 'recurrences.json'] as const;
export const MONTHS_DIR_NAME = 'months';
const MONTH_FILE_EXTENSION = '.json';

export function isRemoteConfig(value: unknown): value is StoredRemoteConfig {
  if (typeof value !== 'object' || value === null) return false;
  const { baseUrl, username, remoteDir, enabled, provider } = value as Partial<RemoteConfig>;
  return typeof baseUrl === 'string' && typeof username === 'string'
    && typeof remoteDir === 'string' && typeof enabled === 'boolean'
    && (provider === undefined || provider === 'webdav' || provider === 'icloud');
}

/** A config saved before iCloud existed has no provider: it was a WebDAV one. */
export function withProvider(config: StoredRemoteConfig): RemoteConfig {
  return { ...config, provider: config.provider ?? 'webdav' };
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/** A directory path with no leading, trailing or doubled separator; blank falls back to the default. */
export function normalizeRemoteDir(remoteDir: string): string {
  const cleaned = remoteDir
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
  return cleaned === '' ? DEFAULT_REMOTE_DIR : cleaned;
}

export function normalizeRemoteConfig(config: RemoteConfig): RemoteConfig {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const username = config.username.trim();
  const provider = config.provider;
  return {
    provider,
    baseUrl,
    username,
    remoteDir: normalizeRemoteDir(config.remoteDir),
    enabled: config.enabled && isRemoteConfigComplete({ ...config, baseUrl, username }),
  };
}

/** iCloud needs no address nor account: it is the one of the device. */
export function isRemoteConfigComplete(config: RemoteConfig): boolean {
  if (config.provider === 'icloud') return true;
  return normalizeBaseUrl(config.baseUrl) !== '' && config.username.trim() !== '';
}

/** Name of a file relative to the remote directory: `categories.json` or `months/YYYY-MM.json`. */
export const monthFilePath = (month: MonthKey): string => `${MONTHS_DIR_NAME}/${month}${MONTH_FILE_EXTENSION}`;

/** The month a file path holds, or `null` when it is not a month file. */
export function monthOfFilePath(file: string): MonthKey | null {
  const prefix = `${MONTHS_DIR_NAME}/`;
  if (!file.startsWith(prefix) || !file.endsWith(MONTH_FILE_EXTENSION)) return null;
  const month = file.slice(prefix.length, -MONTH_FILE_EXTENSION.length);
  return isMonthKey(month) ? month : null;
}

/** Joins a base address and a relative path into the URL to request. */
export function remoteUrl(baseUrl: string, remotePath: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const encoded = remotePath
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return encoded === '' ? base : `${base}/${encoded}`;
}
