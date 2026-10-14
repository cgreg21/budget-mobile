import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { angularJit } from './src/tests/angular-jit.plugin.mts';

const stub = (name: string): string => fileURLToPath(new URL(`./src/tests/stubs/${name}.ts`, import.meta.url));

/*
 * The app runs in the NativeScript runtime; here the platform modules are replaced with in-memory
 * stand-ins (see `src/tests/stubs/`) so the business logic, services and components can be tested
 * with vitest + jsdom + Angular TestBed.
 */
export default defineConfig({
  plugins: [angularJit()],
  // The app's tsconfig only lists platform files; make sure the Angular decorators are compiled the legacy way.
  oxc: { decorator: { legacy: true } },
  resolve: {
    alias: [
      { find: /^~\/(.*)$/, replacement: fileURLToPath(new URL('./src/$1', import.meta.url)) },
      { find: '@nativescript/core', replacement: stub('nativescript-core') },
      { find: '@nativescript/angular', replacement: stub('nativescript-angular') },
      { find: '@nativescript/secure-storage', replacement: stub('secure-storage') },
      { find: '@nativescript-community/sqlite', replacement: stub('sqlite') },
      { find: '@nativescript-community/ui-document-picker', replacement: stub('document-picker') },
      { find: /^@nativescript-community\/ui-canvas.*$/, replacement: stub('plugins') },
      { find: /^@nativescript-community\/ui-chart.*$/, replacement: stub('plugins') },
      { find: /^nativescript-ui-sidedrawer.*$/, replacement: stub('plugins') },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    include: ['src/tests/**/*.spec.ts'],
    setupFiles: ['src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/app/**/*.ts'],
      exclude: ['src/app/**/*.d.ts', 'src/app/app.routes.ts'],
      reporter: ['text'],
    },
  },
});
