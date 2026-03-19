// Loads and caches the sql.js WASM runtime with Vite-compatible asset resolution.
import initSqlJs from 'sql.js';
import sqlWasmAssetUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { SqlJsConfig, SqlJsStatic } from 'sql.js';

import { toDbRuntimeError } from './dbRuntimeErrors';

export interface SqlJsLoader {
  load(): Promise<SqlJsStatic>;
}

export interface CreateSqlJsLoaderOptions {
  readonly initSqlJsFactory?: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  readonly resolveWasmAssetUrl?: () => string;
}

const createLocateFileResolver =
  (wasmAssetUrl: string) =>
  (fileName: string): string =>
    fileName.endsWith('.wasm') ? wasmAssetUrl : fileName;

export const createSqlJsLoader = (options: CreateSqlJsLoaderOptions = {}): SqlJsLoader => {
  const initSqlJsFactory = options.initSqlJsFactory ?? initSqlJs;
  const resolveWasmAssetUrl = options.resolveWasmAssetUrl ?? (() => sqlWasmAssetUrl);
  let runtimePromise: Promise<SqlJsStatic> | null = null;

  return {
    async load(): Promise<SqlJsStatic> {
      if (runtimePromise === null) {
        const wasmAssetUrl = resolveWasmAssetUrl();
        runtimePromise = initSqlJsFactory({
          locateFile: createLocateFileResolver(wasmAssetUrl),
        });
      }

      try {
        return await runtimePromise;
      } catch (error) {
        runtimePromise = null;
        throw toDbRuntimeError(
          error,
          'db_runtime_init_failed',
          'Failed to initialize the local SQLite runtime.',
        );
      }
    },
  };
};

export const appSqlJsLoader = createSqlJsLoader();
