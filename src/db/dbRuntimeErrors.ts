// Defines deterministic error codes for SQLite runtime initialization/open lifecycle failures.
export type DbRuntimeErrorCode =
  | 'db_runtime_init_failed'
  | 'db_open_failed'
  | 'db_pragma_failed'
  | 'db_not_open'
  | 'db_query_failed'
  | 'db_export_failed';

const DEFAULT_ERROR_MESSAGES: Record<DbRuntimeErrorCode, string> = {
  db_runtime_init_failed:
    'Failed to initialize the local SQLite runtime. Reload the app and try again.',
  db_open_failed: 'Failed to open the cached SQLite database snapshot.',
  db_pragma_failed: 'Failed to apply required SQLite runtime pragmas.',
  db_not_open: 'The SQLite runtime is not open.',
  db_query_failed: 'Failed to execute a SQLite query.',
  db_export_failed: 'Failed to export SQLite database bytes.',
};

export class DbRuntimeError extends Error {
  readonly code: DbRuntimeErrorCode;

  constructor(code: DbRuntimeErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? DEFAULT_ERROR_MESSAGES[code], {
      ...(options?.cause === undefined ? {} : { cause: options.cause }),
    });
    this.name = 'DbRuntimeError';
    this.code = code;
  }
}

export const isDbRuntimeError = (error: unknown): error is DbRuntimeError =>
  error instanceof DbRuntimeError;

export const toDbRuntimeError = (
  error: unknown,
  code: DbRuntimeErrorCode,
  fallbackMessage?: string,
): DbRuntimeError => {
  if (isDbRuntimeError(error)) {
    return error;
  }

  return new DbRuntimeError(code, fallbackMessage, { cause: error });
};
