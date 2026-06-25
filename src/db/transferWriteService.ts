// Implements desktop-compatible transfer creation as one atomic SQLite transaction.
import type { QueryExecResult, SqlValue } from 'sql.js';

import { resolveAppBrowserDbRuntime } from './browserDbRuntime';
import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';
import type { BrowserDbRuntime, CreateTransferInput, CreateTransferResult } from './types';

const INSERT_TRANSFER_SQL = `
  INSERT INTO transfer (
    name, from_account, to_account, amount, transfer_type_id,
    category_1_id, category_2_id, category_3_id, date, buyplace
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const UPDATE_SOURCE_ACCOUNT_SQL = `
  UPDATE account SET amount = amount - ? WHERE account_id = ?;
`;

const UPDATE_DESTINATION_ACCOUNT_SQL = `
  UPDATE account SET amount = amount + ? WHERE account_id = ?;
`;

const LAST_INSERT_ROW_ID_SQL = 'SELECT last_insert_rowid() AS transfer_id;';

const normalizeOptionalText = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length === 0 ? null : trimmedValue;
};

const normalizeCategoryIds = (
  categoryIds: readonly number[],
): readonly [number | null, number | null, number | null] => [
  categoryIds[0] ?? null,
  categoryIds[1] ?? null,
  categoryIds[2] ?? null,
];

const readLastInsertRowId = (results: readonly QueryExecResult[]): number => {
  const transferId = results[0]?.values[0]?.[0];

  if (typeof transferId !== 'number' || !Number.isSafeInteger(transferId)) {
    throw new DbRuntimeError(
      'db_query_failed',
      'Failed to read the inserted transfer ID from the local SQLite database.',
    );
  }

  return transferId;
};

export interface TransferWriteService {
  createTransfer(input: CreateTransferInput): CreateTransferResult;
}

type TransferWriteRuntime = Pick<BrowserDbRuntime, 'exec'>;
type TransferWriteRuntimeProvider = TransferWriteRuntime | (() => TransferWriteRuntime);

const resolveTransferWriteRuntime = (
  provider: TransferWriteRuntimeProvider,
): TransferWriteRuntime => (typeof provider === 'function' ? provider() : provider);

const rollbackOpenTransaction = (runtime: TransferWriteRuntime): void => {
  try {
    runtime.exec('ROLLBACK;');
  } catch {
    // Preserve the original write failure; rollback errors are secondary.
  }
};

export const createTransferWriteService = (
  dbRuntime: TransferWriteRuntimeProvider,
): TransferWriteService => ({
  createTransfer(input: CreateTransferInput): CreateTransferResult {
    const runtime = resolveTransferWriteRuntime(dbRuntime);
    let transactionStarted = false;
    let transactionCommitted = false;

    try {
      const [category1Id, category2Id, category3Id] = normalizeCategoryIds(input.categoryIds);
      const buyplace = normalizeOptionalText(input.buyplace);
      const insertParams: SqlValue[] = [
        input.name,
        input.fromAccountId,
        input.toAccountId,
        input.amountCents,
        input.transferTypeId,
        category1Id,
        category2Id,
        category3Id,
        input.bookingDateEpochDay,
        buyplace,
      ];

      runtime.exec('BEGIN IMMEDIATE TRANSACTION;');
      transactionStarted = true;

      runtime.exec(INSERT_TRANSFER_SQL, insertParams);
      const transferId = readLastInsertRowId(runtime.exec(LAST_INSERT_ROW_ID_SQL));
      runtime.exec(UPDATE_SOURCE_ACCOUNT_SQL, [input.amountCents, input.fromAccountId]);
      runtime.exec(UPDATE_DESTINATION_ACCOUNT_SQL, [input.amountCents, input.toAccountId]);
      runtime.exec('COMMIT;');
      transactionCommitted = true;

      return {
        transferId,
        persistedAtIso: new Date().toISOString(),
      };
    } catch (error) {
      if (transactionStarted && !transactionCommitted) {
        rollbackOpenTransaction(runtime);
      }

      throw toDbRuntimeError(
        error,
        'db_query_failed',
        'Failed to create transfer in the local SQLite database.',
      );
    }
  },
});

export const appTransferWriteService = createTransferWriteService(resolveAppBrowserDbRuntime);
