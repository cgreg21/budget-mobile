import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { beforeEach, vi } from 'vitest';

import { resetDocumentPicker } from './stubs/document-picker';
import { resetNativeScript } from './stubs/nativescript-core';
import { resetSecureStorage } from './stubs/secure-storage';
import { resetSqlite } from './stubs/sqlite';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// Keep the console quiet: the fallbacks under test log warnings on purpose.
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeEach(() => {
  resetNativeScript();
  resetSecureStorage();
  resetSqlite();
  resetDocumentPicker();
});
