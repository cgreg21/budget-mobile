import { Injectable, computed, signal } from '@angular/core';
import { Application, ApplicationSettings, Connectivity } from '@nativescript/core';

import { isBalanceThresholds, type BalanceThresholds } from '../domain/balance';
import { isCategoryList, type Category } from '../domain/category';
import {
  DEFAULT_REMOTE_CONFIG, SETTINGS_FILES, isRemoteConfig, isRemoteConfigComplete, monthFilePath,
  monthOfFilePath, normalizeRemoteConfig, withProvider, type RemoteConfig, type SyncStatus,
} from '../domain/remote';
import { isRecurrenceList, sortRecurrences, type Recurrence } from '../domain/recurrence';
import {
  mergeCategories, mergeMonth, mergeRecurrences, mergeThresholds, orderTransactions, sameValue,
} from '../domain/sync-merge';
import { isTransactionArray, type Transaction } from '../domain/transaction';
import { BudgetService } from './budget.service';
import { onLocalChange } from './change-feed';
import { ICloudStore } from './icloud';
import {
  RemoteRequestError, RemoteUnreachableError, type RemoteEntry, type RemoteStore,
} from './remote-store';
import { readPassword, writePassword } from './secrets';
import { readJson, writeJson } from './storage';
import { WebDavClient } from './webdav';

const CONFIG_KEY = 'remote-config';
const DIRTY_KEY = 'sync-dirty';
const LAST_SYNC_KEY = 'sync-last';
const BASE_PREFIX = 'sync-base:';
const ETAG_PREFIX = 'sync-etag:';

const PUSH_DELAY_MS = 2500;
const RETRY_DELAY_MS = 60000;

/** A parsed file: a list of items, or the thresholds object. `undefined` stands for "no such file". */
type FileValue = Transaction[] | Category[] | Recurrence[] | BalanceThresholds;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Keeps the budget in step with a remote directory — a WebDAV server (Infomaniak
 * kDrive, …) shared with the desktop application, or iCloud Drive on iOS. The
 * local database stays the working copy: edits
 * are always accepted, flagged as pending, and reconciled with the server by a
 * three-way merge as soon as it can be reached.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly config = signal<RemoteConfig>(
    withProvider(readJson(CONFIG_KEY, isRemoteConfig, () => ({ ...DEFAULT_REMOTE_CONFIG }))),
  );
  private readonly state = signal<SyncStatus>({
    state: 'disabled',
    pending: 0,
    lastSyncedAt: ApplicationSettings.getString(LAST_SYNC_KEY, '') || undefined,
  });
  readonly status = this.state.asReadonly();
  readonly active = computed(() => this.config().enabled);

  private dirty = new Set<string>(readJson(DIRTY_KEY, isStringArray, () => []));
  private running = false;
  private rerun = false;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  constructor(private readonly budget: BudgetService) {
    this.state.update((s) => ({ ...s, state: this.config().enabled ? 'offline' : 'disabled', pending: this.dirty.size }));
  }

  /** Starts listening to local changes, connectivity and app resume; then synchronises once. */
  start(): void {
    if (this.started) return;
    this.started = true;

    onLocalChange((file) => this.markDirty(file));
    try {
      Connectivity.startMonitoring((type) => {
        if (type !== Connectivity.connectionType.none) this.requestSync(0);
      });
    } catch (error) {
      console.warn('Connectivity monitoring is unavailable:', error);
    }
    Application.on(Application.resumeEvent, () => this.requestSync(0));
    this.requestSync(0);
  }

  /** Saves the connection settings (and password, when given) and synchronises right away. */
  configure(config: RemoteConfig, password: string | null): void {
    const previous = this.config();
    const next = normalizeRemoteConfig(config);
    const sameServer = previous.provider === next.provider && previous.baseUrl === next.baseUrl
      && previous.username === next.username && previous.remoteDir === next.remoteDir;

    if (!sameServer) this.forgetSyncedState();
    if (password !== null) writePassword(password);
    this.config.set(next);
    writeJson(CONFIG_KEY, next);

    if (!next.enabled) {
      this.clearTimers();
      this.setStatus({ state: 'disabled', message: undefined });
      return;
    }
    this.requestSync(0);
  }

  hasPassword(): boolean {
    return readPassword() !== '';
  }

  /** Synchronises now (or as soon as the one in progress ends). */
  syncNow(): Promise<void> {
    return this.run();
  }

  // ---- scheduling -------------------------------------------------------

  private markDirty(file: string): void {
    this.dirty.add(file);
    writeJson(DIRTY_KEY, [...this.dirty]);
    this.setStatus({ pending: this.dirty.size });
    if (this.config().enabled) this.requestSync(PUSH_DELAY_MS);
  }

  private requestSync(delay: number): void {
    if (!this.config().enabled) return;
    if (this.pushTimer !== undefined) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = undefined;
      void this.run();
    }, delay);
  }

  private scheduleRetry(): void {
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.run();
    }, RETRY_DELAY_MS);
  }

  private clearTimers(): void {
    if (this.pushTimer !== undefined) clearTimeout(this.pushTimer);
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.pushTimer = this.retryTimer = undefined;
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.state.update((s) => ({ ...s, ...patch }));
  }

  // ---- synchronisation --------------------------------------------------

  private async run(): Promise<void> {
    const config = this.config();
    if (!config.enabled || !isRemoteConfigComplete(config)) {
      this.setStatus({ state: 'disabled', message: undefined });
      return;
    }
    if (this.running) {
      this.rerun = true;
      return;
    }
    let store: RemoteStore;
    if (config.provider === 'icloud') {
      store = new ICloudStore(config.remoteDir);
    } else {
      const password = readPassword();
      if (password === '') {
        this.setStatus({ state: 'error', message: 'Mot de passe manquant' });
        return;
      }
      store = new WebDavClient(config, password);
    }

    this.running = true;
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.setStatus({ state: 'connecting', message: undefined });

    try {
      const client = store;
      await client.probe();
      this.setStatus({ state: 'syncing' });
      const skipped = await this.syncAll(client);

      const lastSyncedAt = new Date().toISOString();
      ApplicationSettings.setString(LAST_SYNC_KEY, lastSyncedAt);
      this.setStatus({
        state: 'online',
        lastSyncedAt,
        pending: this.dirty.size,
        message: skipped > 0 ? `${skipped} fichier(s) distant(s) illisible(s) ignoré(s)` : undefined,
      });
    } catch (error) {
      this.setStatus(this.failure(error));
      if (error instanceof RemoteUnreachableError) this.scheduleRetry();
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.requestSync(0);
      }
    }
  }

  private failure(error: unknown): Partial<SyncStatus> {
    if (error instanceof RemoteRequestError) return { state: 'error', message: error.message };
    const message = error instanceof Error ? error.message : String(error);
    return { state: 'offline', message };
  }

  /** Returns how many remote files were unreadable and left alone. */
  private async syncAll(client: RemoteStore): Promise<number> {
    await client.ensureDirectory('');
    await client.ensureDirectory('months');
    const rootEntries = (await client.list('')) ?? [];
    const monthEntries = (await client.list('months')) ?? [];

    const remote = new Map<string, RemoteEntry>();
    for (const entry of rootEntries) {
      if (!entry.isDirectory && (SETTINGS_FILES as readonly string[]).includes(entry.name)) remote.set(entry.name, entry);
    }
    for (const entry of monthEntries) {
      const file = `months/${entry.name}`;
      if (!entry.isDirectory && monthOfFilePath(file) !== null) remote.set(file, entry);
    }

    const files = new Set<string>([...SETTINGS_FILES, ...remote.keys()]);
    for (const month of this.budget.monthsWithData()) files.add(monthFilePath(month));
    for (const key of ApplicationSettings.getAllKeys()) {
      if (key.startsWith(BASE_PREFIX)) files.add(key.slice(BASE_PREFIX.length));
    }

    let skipped = 0;
    for (const file of files) {
      const synced = await this.syncFile(client, file, remote.get(file));
      if (!synced) skipped++;
    }
    return skipped;
  }

  /** Reconciles one file; `false` when the remote copy is unreadable and was left alone. */
  private async syncFile(client: RemoteStore, file: string, entry: RemoteEntry | undefined): Promise<boolean> {
    const baseText = ApplicationSettings.hasKey(BASE_PREFIX + file) ? ApplicationSettings.getString(BASE_PREFIX + file) : null;
    const baseEtag = ApplicationSettings.getString(ETAG_PREFIX + file, '') || undefined;
    const base = baseText === null ? undefined : this.parse(file, baseText) ?? undefined;

    // What the server holds now, fetched only when it may differ from what we saw last.
    let remoteText: string | null = baseText;
    let remoteEtag = entry?.etag;
    const etagChanged = entry === undefined
      ? baseText !== null
      : baseText === null || entry.etag === undefined || entry.etag !== baseEtag;
    if (etagChanged) {
      const fetched = entry === undefined ? null : await client.read(file);
      remoteText = fetched?.content ?? null;
      remoteEtag = fetched?.etag ?? entry?.etag;
    }

    const parsedRemote = remoteText === null ? undefined : this.parse(file, remoteText);
    if (parsedRemote === null) return false;
    const remoteValue = parsedRemote;

    const localValue = this.localValue(file);
    const remoteChanged = !sameValue(base, remoteValue);
    const localChanged = !sameValue(base, localValue);

    if (!remoteChanged && !localChanged) {
      this.remember(file, baseText, remoteEtag);
      this.clearDirty(file);
      return true;
    }

    this.clearDirty(file);
    if (!remoteChanged) {
      await this.push(client, file, localValue);
      return true;
    }
    if (!localChanged) {
      this.applyLocal(file, remoteValue);
      this.remember(file, remoteText, remoteEtag);
      return true;
    }

    const merged = this.merge(file, base, localValue, remoteValue);
    if (!sameValue(merged, localValue)) this.applyLocal(file, merged);
    if (sameValue(merged, remoteValue)) this.remember(file, remoteText, remoteEtag);
    else await this.push(client, file, merged);
    return true;
  }

  /** Sends `value` (or deletes the file when it is absent) and records what the server now holds. */
  private async push(client: RemoteStore, file: string, value: FileValue | undefined): Promise<void> {
    try {
      if (value === undefined) {
        await client.remove(file);
        this.remember(file, null, undefined);
        return;
      }
      const text = JSON.stringify(value, null, 2);
      const etag = await client.write(file, text);
      this.remember(file, text, etag);
    } catch (error) {
      // Keeps the change pending; the next run sends it again.
      this.markPending(file);
      throw error;
    }
  }

  private markPending(file: string): void {
    this.dirty.add(file);
    writeJson(DIRTY_KEY, [...this.dirty]);
  }

  private clearDirty(file: string): void {
    if (!this.dirty.delete(file)) return;
    writeJson(DIRTY_KEY, [...this.dirty]);
    this.setStatus({ pending: this.dirty.size });
  }

  private remember(file: string, text: string | null, etag: string | undefined): void {
    if (text === null) {
      ApplicationSettings.remove(BASE_PREFIX + file);
      ApplicationSettings.remove(ETAG_PREFIX + file);
      return;
    }
    ApplicationSettings.setString(BASE_PREFIX + file, text);
    if (etag === undefined) ApplicationSettings.remove(ETAG_PREFIX + file);
    else ApplicationSettings.setString(ETAG_PREFIX + file, etag);
  }

  /** A new server (or directory) starts from scratch: nothing is known about it. */
  private forgetSyncedState(): void {
    for (const key of ApplicationSettings.getAllKeys()) {
      if (key.startsWith(BASE_PREFIX) || key.startsWith(ETAG_PREFIX)) ApplicationSettings.remove(key);
    }
  }

  // ---- file kinds -------------------------------------------------------

  /** Parses file contents: `null` when invalid, `undefined` for a month file holding no transaction. */
  private parse(file: string, text: string): FileValue | undefined | null {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    if (monthOfFilePath(file) !== null) {
      if (!isTransactionArray(json)) return null;
      return json.length === 0 ? undefined : orderTransactions(json);
    }
    switch (file) {
      case 'categories.json': return isCategoryList(json) ? json : null;
      case 'recurrences.json': return isRecurrenceList(json) ? sortRecurrences(json) : null;
      case 'thresholds.json': return isBalanceThresholds(json) ? json : null;
      default: return null;
    }
  }

  /** The local data of a file, in the shared (desktop) format. */
  private localValue(file: string): FileValue | undefined {
    const month = monthOfFilePath(file);
    if (month !== null) {
      const list = this.budget.transactionsOf(month);
      return list.length === 0 ? undefined : orderTransactions(list);
    }
    switch (file) {
      case 'categories.json': return this.budget.categories();
      case 'recurrences.json': return sortRecurrences(this.budget.recurrences());
      case 'thresholds.json': return this.budget.thresholds();
      default: return undefined;
    }
  }

  private applyLocal(file: string, value: FileValue | undefined): void {
    const month = monthOfFilePath(file);
    if (month !== null) {
      this.budget.replaceMonth(month, (value as Transaction[] | undefined) ?? []);
      return;
    }
    if (value === undefined) return;
    switch (file) {
      case 'categories.json': this.budget.replaceCategories(value as Category[]); break;
      case 'recurrences.json': this.budget.replaceRecurrences(value as Recurrence[]); break;
      case 'thresholds.json': this.budget.replaceThresholds(value as BalanceThresholds); break;
    }
  }

  /**
   * Three-way merge. On a first synchronisation (no `base`) the server is the reference:
   * its categories and thresholds replace the local ones, while transactions and
   * recurrences from both sides are combined.
   */
  private merge(file: string, base: FileValue | undefined, local: FileValue | undefined, remote: FileValue | undefined): FileValue | undefined {
    const firstSync = base === undefined;
    if (monthOfFilePath(file) !== null) {
      const merged = mergeMonth((base ?? []) as Transaction[], (local ?? []) as Transaction[], (remote ?? []) as Transaction[], firstSync);
      return merged.length === 0 ? undefined : merged;
    }
    switch (file) {
      case 'categories.json': {
        if (firstSync && remote !== undefined) return remote;
        const merged = mergeCategories((base ?? []) as Category[], (local ?? []) as Category[], (remote ?? []) as Category[], false);
        return merged.length === 0 ? local : merged;
      }
      case 'recurrences.json':
        return mergeRecurrences((base ?? []) as Recurrence[], (local ?? []) as Recurrence[], (remote ?? []) as Recurrence[], firstSync);
      case 'thresholds.json':
        return mergeThresholds(base as BalanceThresholds | undefined, local as BalanceThresholds, (remote ?? local) as BalanceThresholds, firstSync);
      default:
        return local;
    }
  }
}
