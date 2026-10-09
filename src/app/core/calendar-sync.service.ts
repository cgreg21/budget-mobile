import { Injectable, computed, inject, signal } from '@angular/core';
import { Application, Connectivity } from '@nativescript/core';
import {
  CalDavClient, CalendarError, DEFAULT_CALENDAR_CONFIG, DISABLED_CALENDAR_STATUS,
  isCalendarConfig, isCalendarConfigComplete, normalizeCalendarConfig, syncCalendar,
  type CalendarConfig, type CalendarStatus, type SyncBaseline,
} from 'budget-lib';

import { BudgetService } from './budget.service';
import { CalendarNetworkError, nativeCalendarHttp } from './calendar-transport';
import { flushDatabase } from './database';
import { readCalendarPassword, writeCalendarPassword } from './secrets';
import { SettingsService } from './settings.service';
import { readJson, removeKey, writeJson } from './storage';

const CONFIG_KEY = 'calendar-config';
const BASELINE_KEY = 'calendar-baseline';
const LAST_SYNC_KEY = 'calendar-last-sync';
const DEBOUNCE_MS = 2000;

function isBaseline(value: unknown): value is SyncBaseline {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((entry: unknown) => typeof entry === 'object' && entry !== null
      && 'href' in entry && typeof entry.href === 'string'
      && 'hash' in entry && typeof entry.hash === 'string'
      && (!('etag' in entry) || entry.etag === undefined || typeof entry.etag === 'string'));
}

@Injectable({ providedIn: 'root' })
export class CalendarSyncService {
  private readonly budget = inject(BudgetService);
  private readonly settings = inject(SettingsService);
  readonly config = signal<CalendarConfig>(normalizeCalendarConfig(
    readJson(CONFIG_KEY, isCalendarConfig, () => ({ ...DEFAULT_CALENDAR_CONFIG })),
  ));
  private baseline = readJson(BASELINE_KEY, isBaseline, () => ({}));
  private readonly state = signal<CalendarStatus>({
    ...DISABLED_CALENDAR_STATUS,
    state: this.config().enabled ? 'offline' : 'disabled',
    lastSync: readJson(LAST_SYNC_KEY, (v): v is string => typeof v === 'string', () => '') || undefined,
  });
  readonly status = this.state.asReadonly();
  readonly active = computed(() => this.config().enabled);
  readonly busy = computed(() => this.status().state === 'syncing');
  readonly statusText = computed(() => this.settings.t().calendar.states[this.status().state]);
  readonly details = computed(() => {
    const strings = this.settings.t().calendar;
    const iso = this.status().lastSync;
    const date = iso ? new Date(iso) : null;
    const pad = (value: number): string => String(value).padStart(2, '0');
    const formatted = date && Number.isFinite(date.getTime())
      ? this.settings.formatDate(
        date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
      ) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
      : strings.never;
    return this.statusText() + ' \u00B7 ' + strings.lastSync(formatted);
  });

  private started = false;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private pendingSync = false;
  private pendingCheck = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.budget.transactionsChanged.subscribe(() => this.schedule(DEBOUNCE_MS));
    Application.on(Application.resumeEvent, () => this.schedule(0));
    try {
      Connectivity.startMonitoring((type) => {
        if (type !== Connectivity.connectionType.none) this.schedule(0);
      });
    } catch (error) {
      console.warn('Calendar connectivity monitoring is unavailable:', error);
    }
    this.schedule(0);
  }

  hasPassword(): boolean {
    return readCalendarPassword() !== '';
  }

  configure(config: CalendarConfig, password: string | null, synchronize = true): void {
    const next = normalizeCalendarConfig(config);
    const previous = this.config();
    const changed = next.calendarUrl !== previous.calendarUrl || next.username !== previous.username;
    if (!changed && config.enabled === previous.enabled && next.enabled === previous.enabled && password === null) {
      if (synchronize) this.schedule(0);
      return;
    }
    this.revision++;
    this.clearTimer();
    this.pendingSync = this.pendingCheck = false;
    if (changed) {
      this.baseline = {};
      writeJson(BASELINE_KEY, this.baseline);
      removeKey(LAST_SYNC_KEY);
      // Do not reuse another server/account's credentials.
      writeCalendarPassword(password ?? '');
    } else if (password !== null) {
      writeCalendarPassword(password);
    }
    writeJson(CONFIG_KEY, next);
    this.config.set(next);
    const invalid = config.enabled && !isCalendarConfigComplete(next);
    this.state.set({
      state: invalid ? 'error' : next.enabled ? 'offline' : 'disabled',
      lastSync: changed ? undefined : this.status().lastSync,
      message: invalid ? this.settings.t().calendar.invalidConfig : undefined,
    });
    if (synchronize) this.schedule(0);
  }

  syncNow(): Promise<void> {
    if (!this.active()) return Promise.resolve();
    this.clearTimer();
    this.pendingSync = true;
    return this.drain();
  }

  checkConnection(): Promise<void> {
    this.clearTimer();
    this.pendingCheck = true;
    return this.drain();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delay: number): void {
    if (!this.active()) return;
    this.clearTimer();
    if (this.running) {
      this.pendingSync = true;
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.syncNow();
    }, delay);
  }

  /** Connection tests and sync runs share one queue, including settings changes in flight. */
  private drain(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.process().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async process(): Promise<void> {
    while (this.pendingCheck || this.pendingSync) {
      const check = this.pendingCheck;
      if (check) this.pendingCheck = false;
      else this.pendingSync = false;
      const config = this.config();
      const revision = this.revision;
      if (!check && !config.enabled) continue;
      const strings = this.settings.t().calendar;
      if (!isCalendarConfigComplete(config)) {
        this.setStatus({ state: 'error', message: strings.invalidConfig });
        continue;
      }
      const password = readCalendarPassword();
      if (password === '') {
        this.setStatus({ state: 'error', message: strings.missingPassword });
        continue;
      }
      this.setStatus({ state: 'syncing', message: undefined });
      const client = new CalDavClient(config, password, nativeCalendarHttp);
      try {
        if (check) {
          await client.check();
          if (revision === this.revision) {
            this.setStatus({ state: config.enabled ? 'online' : 'disabled', message: strings.connectionOk });
          }
          continue;
        }
        await flushDatabase();
        const local = this.budget.allTransactions();
        const result = await syncCalendar(client, local, this.baseline);
        if (revision !== this.revision) continue;
        this.budget.applyCalendarChanges(result.upsertLocal, result.removeLocal, local);
        await flushDatabase();
        if (revision !== this.revision) continue;
        writeJson(BASELINE_KEY, result.baseline);
        this.baseline = result.baseline;
        const lastSync = new Date().toISOString();
        writeJson(LAST_SYNC_KEY, lastSync);
        this.setStatus({ state: 'online', lastSync, message: result.skipped ? strings.skipped(result.skipped) : undefined });
      } catch (error) {
        if (revision !== this.revision) continue;
        if (error instanceof CalendarNetworkError) {
          this.setStatus({ state: 'offline', message: strings.offlineNote });
        } else if (error instanceof CalendarError) {
          this.setStatus({ state: 'error', message: error.kind === 'auth' ? strings.authFailed : strings.failed(error.message) });
        } else {
          console.error('Calendar synchronization failed:', error);
          this.setStatus({ state: 'error', message: strings.failed(error instanceof Error ? error.message : String(error)) });
        }
      }
    }
  }

  private setStatus(patch: Partial<CalendarStatus>): void {
    this.state.update((status) => ({ ...status, ...patch }));
  }
}
