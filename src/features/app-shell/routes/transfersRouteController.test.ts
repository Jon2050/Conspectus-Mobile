/**
 * Unit tests for the transfers route controller.
 * Ensures the controller coordinates multiple query services to correctly assemble the state for the transfers view.
 */
import { describe, expect, it, vi } from 'vitest';
import { createTransfersRouteController } from './transfersRouteController';
import {
  DbRuntimeError,
  PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  type TransferMonthQueryService,
  type AccountQueryService,
  type CategoryQueryService,
} from '@db';

describe('createTransfersRouteController', () => {
  it('maps and merges DB output correctly', async () => {
    const transferMonthQueryService = {
      listTransfersByMonth: () => [
        {
          transferId: 10,
          bookingDateEpochDay: 19800,
          name: 'Supermarket',
          amountCents: 5000,
          fromAccountId: 1,
          toAccountId: 2,
          categoryIds: [100],
          buyplace: 'Local Market',
        },
      ],
    };

    const accountQueryService = {
      listAllAccounts: () => [
        {
          accountId: 1,
          name: 'Checking',
          amountCents: 10000,
          accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
          isVisible: true,
        },
        {
          accountId: 2,
          name: 'Groceries Account',
          amountCents: 0,
          accountTypeId: 3,
          isVisible: true,
        },
      ],
    };

    const categoryQueryService = {
      listAllCategories: () => [{ categoryId: 100, name: 'Food' }],
    };

    const controller = createTransfersRouteController(
      transferMonthQueryService as unknown as Pick<
        TransferMonthQueryService,
        'listTransfersByMonth'
      >,
      accountQueryService as unknown as Pick<AccountQueryService, 'listAllAccounts'>,
      categoryQueryService as unknown as Pick<CategoryQueryService, 'listAllCategories'>,
    );

    await controller.load(19800);

    const state = controller.getState();
    expect(state.operation).toBe('ready');
    expect(state.transfers).toEqual([
      {
        transferId: 10,
        bookingDateEpochDay: 19800,
        name: 'Supermarket',
        amountCents: 5000,
        amountSemantic: 'positive',
        fromAccountName: 'Checking',
        toAccountName: 'Groceries Account',
        categoryNames: ['Food'],
        buyplace: 'Local Market',
        fromAccountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
        toAccountTypeId: 3,
      },
    ]);
  });

  it('treats a DB runtime not-open error as an empty state without a sync error', async () => {
    const controller = createTransfersRouteController(
      {
        listTransfersByMonth: () => {
          throw new DbRuntimeError('db_not_open', 'SQLite runtime is not open.');
        },
      },
      { listAllAccounts: () => [] },
      { listAllCategories: () => [] },
    );

    await controller.load(19800);

    expect(controller.getState()).toEqual({
      operation: 'empty',
      transfers: [],
      error: null,
    });
  });

  it('surfaces the startup sync error without querying stale transfer data', async () => {
    const listTransfersByMonth = vi.fn(() => []);
    const controller = createTransfersRouteController(
      { listTransfersByMonth },
      { listAllAccounts: () => [] },
      { listAllCategories: () => [] },
    );

    await controller.load(19800, 'Connection is required to load the database.');

    expect(listTransfersByMonth).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      operation: 'error',
      transfers: [],
      error: { message: 'Connection is required to load the database.' },
    });
  });

  it('does not treat duck-typed db_not_open objects as DB runtime errors', async () => {
    const queryError = {
      code: 'db_not_open',
      message: 'Duck typed runtime error.',
    };
    const controller = createTransfersRouteController(
      {
        listTransfersByMonth: () => {
          throw queryError;
        },
      },
      { listAllAccounts: () => [] },
      { listAllCategories: () => [] },
    );

    await controller.load(19800);

    expect(controller.getState()).toEqual({
      operation: 'error',
      transfers: [],
      error: {
        message: 'Failed to load transfers for the selected month.',
        cause: queryError,
      },
    });
  });
});
