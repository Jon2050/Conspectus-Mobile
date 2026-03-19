// Implements the browser-side SQLite open/close lifecycle over cached snapshot bytes.
import type { BindParams, Database, QueryExecResult, SqlJsStatic } from 'sql.js';

import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';
import { appSqlJsLoader, type SqlJsLoader } from './sqlJsLoader';

const FOREIGN_KEYS_PRAGMA_VALUE = 1;
const SQLITE_DATABASE_HEADER = Uint8Array.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

const hasSqliteHeader = (snapshotBytes: Uint8Array): boolean => {
  if (snapshotBytes.length < SQLITE_DATABASE_HEADER.length) {
    return false;
  }

  return SQLITE_DATABASE_HEADER.every(
    (expectedByte, index) => snapshotBytes[index] === expectedByte,
  );
};

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

export interface BrowserDbRuntime {
  open(snapshotBytes: Uint8Array, options?: BrowserDbRuntimeOpenOptions): Promise<void>;
  close(): void;
  isOpen(): boolean;
  exec(sql: string, params?: BindParams): readonly QueryExecResult[];
  exportBytes(): Uint8Array;
}

export interface BrowserDbRuntimeOpenOptions {
  readonly canApply?: () => boolean;
}

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

      if (database !== null) {
        database.close();
        database = null;
      }

      let nextDatabase: Database | null = null;

      try {
        nextDatabase = new sqlJsRuntime.Database(snapshotBytes);
        applyRequiredPragmas(nextDatabase);
        database = nextDatabase;
      } catch (error) {
        nextDatabase?.close();
        database = null;

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
