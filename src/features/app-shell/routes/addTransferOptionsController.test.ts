// Verifies Add Transfer option loading, mapping, and DB-not-ready behavior.
import { describe, expect, it, vi } from 'vitest';
import { DbRuntimeError } from '@db';

import {
  createAddTransferOptionsController,
  shouldReloadAddTransferOptionsForSyncState,
} from './addTransferOptionsController';

describe('createAddTransferOptionsController', () => {
  it('loads and maps account and category options', async () => {
    const listAddTransferFromAccountOptions = vi.fn(() => [
      { accountId: 1, name: 'Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 10, name: 'Cash', amountCents: 500, accountTypeId: 3 },
    ]);
    const listAddTransferToAccountOptions = vi.fn(() => [
      { accountId: 2, name: 'Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 10, name: 'Cash', amountCents: 500, accountTypeId: 3 },
    ]);
    const listAllCategories = vi.fn(() => [
      { categoryId: 20, name: 'Groceries' },
      { categoryId: 30, name: 'Rent' },
    ]);
    const controller = createAddTransferOptionsController(
      { listAddTransferFromAccountOptions, listAddTransferToAccountOptions },
      { listAllCategories },
    );

    await controller.load();

    expect(controller.getState()).toEqual({
      operation: 'ready',
      fromAccountOptions: [
        { accountId: 1, name: 'Income', accountTypeId: 1 },
        { accountId: 10, name: 'Cash', accountTypeId: 3 },
      ],
      toAccountOptions: [
        { accountId: 2, name: 'Spendings', accountTypeId: 2 },
        { accountId: 10, name: 'Cash', accountTypeId: 3 },
      ],
      categoryOptions: [
        { categoryId: 20, name: 'Groceries' },
        { categoryId: 30, name: 'Rent' },
      ],
      error: null,
    });
    expect(listAddTransferFromAccountOptions).toHaveBeenCalledTimes(1);
    expect(listAddTransferToAccountOptions).toHaveBeenCalledTimes(1);
    expect(listAllCategories).toHaveBeenCalledTimes(1);
  });

  it('keeps loading when the DB runtime is not open yet', async () => {
    const controller = createAddTransferOptionsController(
      {
        listAddTransferFromAccountOptions: () => {
          throw new DbRuntimeError('db_not_open', 'No DB is open.');
        },
        listAddTransferToAccountOptions: vi.fn(),
      },
      { listAllCategories: vi.fn() },
    );

    await controller.load();

    expect(controller.getState()).toEqual({
      operation: 'loading',
      fromAccountOptions: [],
      toAccountOptions: [],
      categoryOptions: [],
      error: null,
    });
  });

  it('surfaces query failures as an error state', async () => {
    const controller = createAddTransferOptionsController(
      {
        listAddTransferFromAccountOptions: () => {
          throw new Error('query failed');
        },
        listAddTransferToAccountOptions: vi.fn(),
      },
      { listAllCategories: vi.fn() },
    );

    await controller.load();

    expect(controller.getState().operation).toBe('error');
    expect(controller.getState().error?.message).toBe('query failed');
    expect(controller.getState().fromAccountOptions).toEqual([]);
    expect(controller.getState().toAccountOptions).toEqual([]);
    expect(controller.getState().categoryOptions).toEqual([]);
  });

  it('reloads options only after sync states that can provide an opened DB snapshot', () => {
    expect(shouldReloadAddTransferOptionsForSyncState('synced')).toBe(true);
    expect(shouldReloadAddTransferOptionsForSyncState('stale')).toBe(true);
    expect(shouldReloadAddTransferOptionsForSyncState('offline')).toBe(true);
    expect(shouldReloadAddTransferOptionsForSyncState('idle')).toBe(false);
    expect(shouldReloadAddTransferOptionsForSyncState('syncing')).toBe(false);
    expect(shouldReloadAddTransferOptionsForSyncState('error')).toBe(false);
  });
});
