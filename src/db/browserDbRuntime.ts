// Implements the browser-side SQLite open/close lifecycle over cached snapshot bytes.
import type { BindParams, Database, QueryExecResult, SqlJsStatic } from 'sql.js';

import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';
import { hasSqliteHeader } from './sqliteFileSignature';
import { appSqlJsLoader, type SqlJsLoader } from './sqlJsLoader';
import type { BrowserDbRuntime, BrowserDbRuntimeOpenOptions } from './types';

const FOREIGN_KEYS_PRAGMA_VALUE = 1;

const applyRequiredPragmas = (database: Database): void => {
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    const pragmaResult = database.exec('PRAGMA foreign_keys;');
    const pragmaValue = pragmaResult[0]?.values[0]?.[0];

    if (pragmaValue !== FOREIGN_KEYS_PRAGMA_VALUE) {
      throw new Error(
        `Expected PRAGMA foreign_keys=${FOREIGN_KEYS_PRAGMA_VALUE} but got ${String(pragmaValue)}.`,
      );
    }
  } catch (error) {
    throw toDbRuntimeError(
      error,
      'db_pragma_failed',
      'Failed to apply required SQLite pragmas after opening the database snapshot.',
    );
  }
};

declare global {
  interface Window {
    __CONSPECTUS_APP_DB_RUNTIME__?: BrowserDbRuntime;
  }
}

const isLocalDbRuntimeMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

const isBrowserDbRuntime = (value: unknown): value is BrowserDbRuntime => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<BrowserDbRuntime>;
  return (
    typeof candidate.open === 'function' &&
    typeof candidate.close === 'function' &&
    typeof candidate.isOpen === 'function' &&
    typeof candidate.exec === 'function' &&
    typeof candidate.exportBytes === 'function'
  );
};

export const createBrowserDbRuntime = (
  sqlJsLoader: SqlJsLoader = appSqlJsLoader,
): BrowserDbRuntime => {
  let sqlJsRuntime: SqlJsStatic | null = null;
  let database: Database | null = null;

  const requireOpenDatabase = (): Database => {
    if (database === null) {
      throw new DbRuntimeError(
        'db_not_open',
        'SQLite runtime is not open yet. Open a snapshot before running queries.',
      );
    }

    return database;
  };

  return {
    async open(
      snapshotBytes: Uint8Array,
      options: BrowserDbRuntimeOpenOptions = {},
    ): Promise<void> {
      if (snapshotBytes.length === 0) {
        throw new DbRuntimeError(
          'db_open_failed',
          'The cached SQLite snapshot payload was empty and could not be opened.',
        );
      }

      if (options.canApply !== undefined && !options.canApply()) {
        return;
      }

      if (!hasSqliteHeader(snapshotBytes)) {
        throw new DbRuntimeError(
          'db_open_failed',
          'The cached SQLite snapshot payload is not a valid SQLite database file.',
        );
      }

      if (sqlJsRuntime === null) {
        try {
          sqlJsRuntime = await sqlJsLoader.load();
        } catch (error) {
          throw toDbRuntimeError(
            error,
            'db_runtime_init_failed',
            'Failed to initialize the local SQLite runtime.',
          );
        }
      }

      if (options.canApply !== undefined && !options.canApply()) {
        return;
      }

      let nextDatabase: Database | null = null;

      try {
        nextDatabase = new sqlJsRuntime.Database(snapshotBytes);
        applyRequiredPragmas(nextDatabase);

        if (options.canApply !== undefined && !options.canApply()) {
          nextDatabase.close();
          return;
        }

        const previousDatabase = database;
        database = nextDatabase;
        nextDatabase = null;
        previousDatabase?.close();
      } catch (error) {
        nextDatabase?.close();

        if (error instanceof DbRuntimeError) {
          throw error;
        }

        throw toDbRuntimeError(
          error,
          'db_open_failed',
          'Failed to open the cached SQLite snapshot in the browser runtime.',
        );
      }
    },

    close(): void {
      if (database !== null) {
        database.close();
        database = null;
      }
    },

    isOpen(): boolean {
      return database !== null;
    },

    exec(sql: string, params?: BindParams): readonly QueryExecResult[] {
      try {
        return requireOpenDatabase().exec(sql, params);
      } catch (error) {
        if (error instanceof DbRuntimeError) {
          throw error;
        }

        throw toDbRuntimeError(error, 'db_query_failed');
      }
    },

    exportBytes(): Uint8Array {
      try {
        return requireOpenDatabase().export();
      } catch (error) {
        if (error instanceof DbRuntimeError) {
          throw error;
        }

        throw toDbRuntimeError(error, 'db_export_failed');
      }
    },
  };
};

export const appBrowserDbRuntime = createBrowserDbRuntime();

export const resolveAppBrowserDbRuntime = (): BrowserDbRuntime => {
  if (isLocalDbRuntimeMockHost() && isBrowserDbRuntime(window.__CONSPECTUS_APP_DB_RUNTIME__)) {
    return window.__CONSPECTUS_APP_DB_RUNTIME__;
  }

  return appBrowserDbRuntime;
};
