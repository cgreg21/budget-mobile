/* Stand-in for `@nativescript/angular`: enough DI tokens and a no-op module for TestBed. */
import { Injectable, NgModule } from '@angular/core';
import { vi } from 'vitest';

@NgModule({})
export class NativeScriptCommonModule {}

@NgModule({})
export class NativeScriptModule {}

@NgModule({})
export class NativeScriptRouterModule {
  static forRoot(): { ngModule: typeof NativeScriptRouterModule } { return { ngModule: NativeScriptRouterModule }; }
}

export class ModalDialogParams {
  constructor(public context: unknown = {}, public closeCallback: (result?: unknown) => void = vi.fn()) {}
}

@Injectable({ providedIn: 'root' })
export class ModalDialogService {
  showModal = vi.fn(() => Promise.resolve(undefined));
}

@Injectable({ providedIn: 'root' })
export class RouterExtensions {
  navigate = vi.fn(() => Promise.resolve(true));
  back = vi.fn();
  backToPrevious = vi.fn();
  canGoBack = vi.fn(() => true);
}

export class PageRouterOutlet {}

export const registerElement = vi.fn();
export const bootstrapApplication = vi.fn(() => Promise.resolve());
export const provideNativeScriptRouter = vi.fn(() => []);
export const provideNativeScriptHttpClient = vi.fn(() => []);
export const runNativeScriptAngularApp = vi.fn();
