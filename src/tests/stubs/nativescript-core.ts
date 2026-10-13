/*
 * Stand-in for `@nativescript/core` under vitest. Only what the app imports is provided; every
 * piece of state lives in `nsState` so a test can reset or script it (see `resetNativeScript`).
 */
import { vi } from 'vitest';

export interface FakeRootView {
  cssClasses: Set<string>;
  _onCssStateChange: () => void;
}

type NsState = {
  settings: Map<string, string>;
  rootView: FakeRootView | null;
  systemAppearance: 'dark' | 'light' | null;
  connectionType: number;
  documentsPath: string;
  events: Map<string, Set<(args: unknown) => void>>;
};

// Kept on `globalThis` so the state survives `vi.resetModules()` (used to re-import module singletons).
const g = globalThis as unknown as { __nsState?: NsState };
export const nsState: NsState = g.__nsState ??= {
  settings: new Map<string, string>(),
  rootView: null,
  systemAppearance: 'dark',
  connectionType: 1,
  documentsPath: '/documents',
  events: new Map(),
};

export function makeRootView(): FakeRootView {
  return { cssClasses: new Set<string>(), _onCssStateChange: vi.fn() };
}

export function resetNativeScript(): void {
  nsState.settings.clear();
  nsState.rootView = null;
  nsState.systemAppearance = 'dark';
  nsState.connectionType = 1;
  nsState.events.clear();
  Http.request.mockReset();
  Dialogs.confirm.mockReset();
  Dialogs.alert.mockReset();
  Utils.openUrl.mockReset();
}

export const ApplicationSettings = {
  getString(key: string, fallback = ''): string { return nsState.settings.get(key) ?? fallback; },
  setString(key: string, value: string): void { nsState.settings.set(key, value); },
  remove(key: string): void { nsState.settings.delete(key); },
  getAllKeys(): string[] { return [...nsState.settings.keys()]; },
  clear(): void { nsState.settings.clear(); },
};

export const Application = {
  getRootView: () => nsState.rootView,
  systemAppearance: () => nsState.systemAppearance,
  on(event: string, handler: (args: unknown) => void): void {
    let set = nsState.events.get(event);
    if (!set) nsState.events.set(event, (set = new Set()));
    set.add(handler);
  },
  off(event: string, handler?: (args: unknown) => void): void {
    if (handler) nsState.events.get(event)?.delete(handler);
    else nsState.events.delete(event);
  },
  /** Test helper: fires every handler registered for `event`. */
  notify(event: string, args: unknown = {}): void {
    for (const handler of nsState.events.get(event) ?? []) handler(args);
  },
  resumeEvent: 'resume',
  suspendEvent: 'suspend',
  android: { on: vi.fn(), off: vi.fn(), activityNewIntentEvent: 'activityNewIntent', foregroundActivity: null },
  ios: null,
};

export const Connectivity = {
  connectionType: { none: 0, wifi: 1, mobile: 2, ethernet: 3, bluetooth: 4, vpn: 5 },
  getConnectionType: () => nsState.connectionType,
  startMonitoring: vi.fn((callback: (type: number) => void) => {
    nsState.events.set('connectivity', new Set([callback as (args: unknown) => void]));
  }),
  stopMonitoring: vi.fn(),
};

export const Http = { request: vi.fn() };
export const Dialogs = { confirm: vi.fn(), alert: vi.fn() };
export const Utils = { openUrl: vi.fn(), android: {}, ios: {} };

export const knownFolders = { documents: () => ({ path: nsState.documentsPath }) };
export const path = { join: (...parts: string[]) => parts.join('/') };

export const isAndroid = true;
export const isIOS = false;

export const Device = { os: 'Android', osVersion: '14', sdkVersion: '34', deviceType: 'Phone' };
export const Screen = {
  mainScreen: { widthDIPs: 400, heightDIPs: 800, widthPixels: 1200, heightPixels: 2400, scale: 3 },
};

export const CoreTypes = {
  AnimationCurve: { easeOut: 'easeOut', easeIn: 'easeIn', easeInOut: 'easeInOut', linear: 'linear', spring: 'spring' },
  Visibility: { visible: 'visible', collapse: 'collapse', hidden: 'hidden' },
};

export const GestureStateTypes = { began: 1, changed: 2, ended: 3, cancelled: 4 };

export class View {
  static unloadedEvent = 'unloaded';
  static loadedEvent = 'loaded';
  static layoutChangedEvent = 'layoutChanged';
  cssClasses = new Set<string>();
  marginBottom = 0;
  verticalAlignment = 'top';
  private handlers = new Map<string, Set<(args?: unknown) => void>>();
  opacity = 1;
  translateX = 0;
  translateY = 0;
  scaleX = 1;
  scaleY = 1;
  visibility = 'visible';
  animate = vi.fn(() => Promise.resolve());
  requestLayout = vi.fn();
  getMeasuredWidth = vi.fn(() => 0);
  getMeasuredHeight = vi.fn(() => 0);
  getActualSize = vi.fn(() => ({ width: 0, height: 0 }));
  getChildAt = vi.fn((_index: number): View | undefined => undefined);
  _onCssStateChange = vi.fn();

  on(event: string, handler: (args?: unknown) => void): void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
  }
  once(event: string, handler: (args?: unknown) => void): void {
    const wrapper = (args?: unknown): void => { this.off(event, wrapper); handler(args); };
    this.on(event, wrapper);
  }
  off(event: string, handler?: (args?: unknown) => void): void {
    if (handler) this.handlers.get(event)?.delete(handler);
    else this.handlers.delete(event);
  }
  /** Test helper: fires every handler registered on this view for `event`. */
  notify(event: string, args: unknown = { object: this }): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(args);
  }
  listenerCount(event: string): number { return this.handlers.get(event)?.size ?? 0; }
}
export class Page extends View {
  actionBarHidden = false;
}
export class ScrollView extends View {
  verticalOffset = 0;
  scrollableHeight = 0;
  scrollToVerticalOffset = vi.fn();
}

export type AndroidActivityNewIntentEventData = { intent: unknown };
export type NavigationTransition = { name?: string; duration?: number; curve?: string };
export type PanGestureEventData = { state: number; deltaX: number; deltaY: number; view?: unknown };
export type TouchGestureEventData = { action: string; view?: unknown };
export type ScrollEventData = { scrollY: number; scrollX: number; object: unknown };
