// Validates the desktop schema at the import boundary; never migrates or repairs user data.
import { DbRuntimeError } from './dbRuntimeErrors';
import { createBrowserDbRuntime } from './browserDbRuntime';
import type { BrowserDbRuntime } from './types';

export interface CachedDatabaseSnapshotValidator {
  validate(snapshotBytes: Uint8Array, signal?: AbortSignal): Promise<void>;
}

const REQUIRED_COLUMNS = {
  account: ['account_id', 'name', 'amount', 'ac_order', 'ac_type_id', 'visible'],
  category: ['category_id', 'name'],
  transfer: [
    'transfer_id',
    'name',
    'from_account',
    'to_account',
    'amount',
    'transfer_type_id',
    'category_1_id',
    'category_2_id',
    'category_3_id',
    'date',
    'buyplace',
  ],
  account_type: ['ac_type_id', 'account_type_name'],
  transfer_type: ['transfer_type_id', 'transfer_type_name'],
} as const;

const invalid = (detail: string): never => {
  throw new DbRuntimeError('db_open_failed', `Unusable Conspectus database: ${detail}`);
};

export const validateOpenedConspectusDatabase = (runtime: Pick<BrowserDbRuntime, 'exec'>): void => {
  if (runtime.exec('PRAGMA integrity_check;')[0]?.values[0]?.[0] !== 'ok')
    invalid('integrity check failed.');
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const info = runtime.exec(`PRAGMA table_info(${table});`)[0]?.values ?? [];
    const actual = new Set(info.map((row) => row[1]));
    const missing = columns.filter((column) => !actual.has(column));
    if (missing.length) invalid(`missing ${table} columns: ${missing.join(', ')}.`);
    const primaryKey = info.find((row) => row[1] === columns[0]);
    if (primaryKey?.[2] !== 'INTEGER' || primaryKey[5] !== 1)
      invalid(`missing integer primary key in ${table}.`);
  }
  if ((runtime.exec('PRAGMA foreign_key_check;')[0]?.values.length ?? 0) > 0)
    invalid('foreign key check failed.');

  // Check logical references too: a foreign database may omit the desktop FK declarations.
  const orphanQueries = [
    'SELECT 1 FROM account a LEFT JOIN account_type t ON a.ac_type_id = t.ac_type_id WHERE a.ac_type_id IS NULL OR t.ac_type_id IS NULL LIMIT 1',
    ...['from_account', 'to_account'].map(
      (column) =>
        `SELECT 1 FROM transfer t LEFT JOIN account a ON t.${column} = a.account_id WHERE a.account_id IS NULL LIMIT 1`,
    ),
    'SELECT 1 FROM transfer t LEFT JOIN transfer_type k ON t.transfer_type_id = k.transfer_type_id WHERE k.transfer_type_id IS NULL LIMIT 1',
    ...['category_1_id', 'category_2_id', 'category_3_id'].map(
      (column) =>
        `SELECT 1 FROM transfer t LEFT JOIN category c ON t.${column} = c.category_id WHERE t.${column} IS NOT NULL AND c.category_id IS NULL LIMIT 1`,
    ),
  ];
  if (orphanQueries.some((sql) => (runtime.exec(sql)[0]?.values.length ?? 0) > 0))
    invalid('invalid account, category or transfer-type reference.');
  for (const type of [1, 2]) {
    if (
      runtime.exec('SELECT COUNT(*) FROM account WHERE ac_type_id = ?;', [type])[0]
        ?.values[0]?.[0] !== 1
    )
      invalid('exactly one primary income and spendings account is required.');
  }
  if (
    runtime.exec('SELECT COUNT(*) FROM transfer_type WHERE transfer_type_id IN (1, 2, 3);')[0]
      ?.values[0]?.[0] !== 3
  )
    invalid('required transfer types are missing.');
};

export const createSqliteSnapshotValidator = (
  runtime: Pick<BrowserDbRuntime, 'open' | 'close' | 'exec'> = createBrowserDbRuntime(),
): CachedDatabaseSnapshotValidator => ({
  async validate(bytes): Promise<void> {
    try {
      await runtime.open(bytes);
      validateOpenedConspectusDatabase(runtime);
    } catch (error) {
      if (error instanceof DbRuntimeError && error.code === 'db_open_failed') throw error;
      throw new DbRuntimeError(
        'db_open_failed',
        'The snapshot could not be validated as a usable Conspectus database.',
        { cause: error },
      );
    } finally {
      runtime.close();
    }
  },
});
