// Replaces or removes an existing transfer and its balance effects atomically.
import type { BrowserDbRuntime, CreateTransferInput, TransferRecord } from './types';
import { resolveAppBrowserDbRuntime } from './browserDbRuntime';
import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';

export interface TransferMutationService {
  updateTransfer(original: TransferRecord, replacement: CreateTransferInput): void;
  deleteTransfer(original: TransferRecord): void;
}

export const createTransferMutationService = (
  provider: Pick<BrowserDbRuntime, 'exec'> | (() => Pick<BrowserDbRuntime, 'exec'>),
): TransferMutationService => {
  const mutate = (original: TransferRecord, replacement?: CreateTransferInput): void => {
    const runtime = typeof provider === 'function' ? provider() : provider;
    let started = false;
    try {
      runtime.exec('BEGIN IMMEDIATE TRANSACTION;');
      started = true;
      const row = runtime.exec(
        `SELECT date, name, amount, from_account, to_account,
                category_1_id, category_2_id, category_3_id, buyplace
         FROM transfer WHERE transfer_id = ?;`,
        [original.transferId],
      )[0]?.values[0];
      const expected = [
        original.bookingDateEpochDay,
        original.name,
        original.amountCents,
        original.fromAccountId,
        original.toAccountId,
        ...original.categoryIds,
        original.buyplace,
      ];
      const current =
        row === undefined
          ? undefined
          : [...row.slice(0, 5), ...row.slice(5, 8).filter((id) => id !== null), row[8]];
      if (
        row === undefined ||
        current?.length !== expected.length ||
        current.some((value, index) => value !== expected[index])
      ) {
        throw new DbRuntimeError(
          'db_query_failed',
          'The transfer changed or was deleted. Reopen it before editing.',
        );
      }
      // Reverse the old booking before applying the replacement, including account swaps.
      runtime.exec('UPDATE account SET amount = amount + ? WHERE account_id = ?;', [
        original.amountCents,
        original.fromAccountId,
      ]);
      runtime.exec('UPDATE account SET amount = amount - ? WHERE account_id = ?;', [
        original.amountCents,
        original.toAccountId,
      ]);
      if (replacement === undefined) {
        runtime.exec('DELETE FROM transfer WHERE transfer_id = ?;', [original.transferId]);
      } else {
        runtime.exec(
          `UPDATE transfer SET date = ?, name = ?, amount = ?, from_account = ?, to_account = ?,
           transfer_type_id = ?, category_1_id = ?, category_2_id = ?, category_3_id = ?, buyplace = ?
           WHERE transfer_id = ?;`,
          [
            replacement.bookingDateEpochDay,
            replacement.name,
            replacement.amountCents,
            replacement.fromAccountId,
            replacement.toAccountId,
            replacement.transferTypeId,
            replacement.categoryIds[0] ?? null,
            replacement.categoryIds[1] ?? null,
            replacement.categoryIds[2] ?? null,
            replacement.buyplace?.trim() || null,
            original.transferId,
          ],
        );
        runtime.exec('UPDATE account SET amount = amount - ? WHERE account_id = ?;', [
          replacement.amountCents,
          replacement.fromAccountId,
        ]);
        runtime.exec('UPDATE account SET amount = amount + ? WHERE account_id = ?;', [
          replacement.amountCents,
          replacement.toAccountId,
        ]);
      }
      runtime.exec('COMMIT;');
    } catch (error) {
      if (started) {
        try {
          runtime.exec('ROLLBACK;');
        } catch {
          /* Preserve the original failure. */
        }
      }
      throw toDbRuntimeError(error, 'db_query_failed', 'Failed to modify the transfer.');
    }
  };
  return {
    updateTransfer: (original, replacement) => mutate(original, replacement),
    deleteTransfer: (original) => mutate(original),
  };
};

export const appTransferMutationService = createTransferMutationService(resolveAppBrowserDbRuntime);
