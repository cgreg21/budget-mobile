/*
 * Vite plugin compiling the app's TypeScript with Angular's JIT transform. Without it, the signal
 * based `input()` / `output()` / `viewChild()` fields are invisible to the JIT compiler (the CLI
 * applies the same transform when it builds the app).
 */
import { constructorParametersDownlevelTransform } from '@angular/compiler-cli/private/tooling';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { Plugin } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = /[\\/]src[\\/](app|tests)[\\/].*\.ts$/;

let program: ts.Program | null = null;

function programFor(): ts.Program {
  if (program) return program;
  const configPath = resolve(ROOT, 'tsconfig.spec.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: false,
    noEmitOnError: false,
    noEmitHelpers: false,
    emitDecoratorMetadata: false,
    sourceMap: true,
    inlineSources: true,
    declaration: false,
  });
  return program;
}

export function angularJit(): Plugin {
  return {
    name: 'angular-jit',
    enforce: 'pre',
    transform(_code, id) {
      const file = id.split('?')[0];
      if (!SOURCES.test(file)) return null;
      const current = programFor();
      const source = current.getSourceFile(file.replace(/\\/g, '/'));
      if (!source) return null;

      let js = '';
      let map = '';
      current.emit(source, (name, text) => {
        if (name.endsWith('.map')) map = text;
        else js = text;
      }, undefined, false, { before: [constructorParametersDownlevelTransform(current)] });
      return { code: js, map: map ? JSON.parse(map) : null };
    },
  };
}
