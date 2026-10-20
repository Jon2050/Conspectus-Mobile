// Verifies Add Transfer save-state orchestration, upload retry behavior, and toast feedback.
import { describe, expect, it, vi } from 'vitest';

import { DatabaseUploadError } from '../databaseUploadHandoffService';
import type { DatabaseConflictRecoveryService } from '../databaseConflictRecoveryService';
import {
  TransferBatchUploadPendingError,
  type TransferBatchSaveExportService,
} from '../transferSaveExportService';
import type { CreateTransferBatchResult } from '@db';
import {
  createInitialFormFields,
  NO_CATEGORY_SELECTED,
  type AddTransferFormFields,
} from '../../transfers/addTransferFormState';
import {
  createAddTransferSaveController,
  type AddTransferSaveState,
} from './addTransferSaveController';
import type { AddTransferOptionsState } from './addTransferOptionsController';

const t = (key: string): string => key;

const READY_OPTIONS: AddTransferOptionsState = {
  operation: 'ready',
  fromAccountOptions: [
    { accountId: 1, name: 'Income', accountTypeId: 1 },
    { accountId: 3, name: 'Checking', accountTypeId: 3 },
  ],
  toAccountOptions: [
    { accountId: 2, name: 'Spendings', accountTypeId: 2 },
    { accountId: 4, name: 'Savings', accountTypeId: 3 },
  ],
  categoryOptions: [{ categoryId: 7, name: 'Food' }],
  error: null,
};

const createValidFields = (): AddTransferFormFields => ({
  ...createInitialFormFields(),
  date: '2024-05-12',
  name: 'Groceries',
  amount: '12,34€',
  fromAccountId: 3,
  toAccountId: 4,
  category1Id: 7,
  category2Id: NO_CATEGORY_SELECTED,
  category3Id: NO_CATEGORY_SELECTED,
  buyplace: 'Market',
});

const identity = () => ({
  isAuthenticated: true,
  isVerifiedCurrent: true,
  contextKey: 'account|drive|item',
});
const createSaveService = (): TransferBatchSaveExportService => ({
  createTransferBatchAndExport: vi.fn(async (_inputs, options) => {
    options?.onUploadStart?.();
    options?.onProgress?.({ loadedBytes: 5, totalBytes: 10 });
    return { transferIds: [42], createdCount: 1, persistedAtIso: '2026-06-25T00:00:00.000Z' };
  }),
  retryExportedDatabaseUpload: vi.fn(async () => {}),
});
const createConflictRecoveryService = (): DatabaseConflictRecoveryService => ({
  discardStaleRuntime: vi.fn(),
  syncLatestDatabase: vi.fn(async () => {}),
});
const collectStates = (
  controller: ReturnType<typeof createAddTransferSaveController>,
): AddTransferSaveState[] => {
  const states: AddTransferSaveState[] = [];
  controller.subscribe((state) => states.push(state));
  return states;
};
const createController = (
  service = createSaveService(),
  recovery = createConflictRecoveryService(),
) => createAddTransferSaveController(service, { show: vi.fn() }, recovery, identity);

describe('manual transfer producer', () => {
  it('returns validation errors without invoking the save service', async () => {
    const saveService = createSaveService();
    const toastStore = { show: vi.fn() };
    const controller = createAddTransferSaveController(
      saveService,
      toastStore,
      createConflictRecoveryService(),
      identity,
    );
    const invalidFields = { ...createValidFields(), name: 'No' };

    const result = await controller.submit(invalidFields, READY_OPTIONS, t);

    expect(result.validationErrors).toContain('addTransfer.validation.nameLength');
    expect(saveService.createTransferBatchAndExport).not.toHaveBeenCalled();
    expect(toastStore.show).not.toHaveBeenCalled();
  });

  it('blocks empty or malformed dates before local save begins', async () => {
    const saveService = createSaveService();
    const controller = createAddTransferSaveController(
      saveService,
      { show: vi.fn() },
      createConflictRecoveryService(),
      identity,
    );
    const states = collectStates(controller);

    for (const date of ['', '2024-02-30']) {
      const result = await controller.submit({ ...createValidFields(), date }, READY_OPTIONS, t);
      expect(result.validationErrors).toContain('addTransfer.validation.dateInvalid');
    }

    expect(saveService.createTransferBatchAndExport).not.toHaveBeenCalled();
    expect(states.map((state) => state.phase)).toEqual(['idle']);
  });

  it('blocks stale account selections and unavailable option states before local save begins', async () => {
    const saveService = createSaveService();
    const controller = createAddTransferSaveController(
      saveService,
      { show: vi.fn() },
      createConflictRecoveryService(),
      identity,
    );
    const states = collectStates(controller);

    const staleAccountResult = await controller.submit(
      { ...createValidFields(), fromAccountId: 999 },
      READY_OPTIONS,
      t,
    );
    const optionsErrorResult = await controller.submit(
      createValidFields(),
      { ...READY_OPTIONS, operation: 'error' },
      t,
    );

    expect(staleAccountResult.validationErrors).toContain(
      'addTransfer.validation.fromAccountUnavailable',
    );
    expect(optionsErrorResult.validationErrors).toEqual([
      'addTransfer.validation.optionsUnavailable',
    ]);
    expect(saveService.createTransferBatchAndExport).not.toHaveBeenCalled();
    expect(states.map((state) => state.phase)).toEqual(['idle']);
  });

  it('maps a manual transfer to one immutable batch through the common commit path', async () => {
    const service = createSaveService();
    const controller = createController(service);
    await controller.submit(createValidFields(), READY_OPTIONS, t);
    const batch = vi.mocked(service.createTransferBatchAndExport).mock.calls[0]?.[0];
    expect(batch).toEqual([
      {
        bookingDateEpochDay: 19855,
        name: 'Groceries',
        amountCents: 1234,
        transferTypeId: 3,
        fromAccountId: 3,
        toAccountId: 4,
        categoryIds: [7],
        buyplace: 'Market',
      },
    ]);
    expect(Object.isFrozen(batch)).toBe(true);
    expect(Object.isFrozen(batch?.[0]?.categoryIds)).toBe(true);
    expect(controller.getState().phase).toBe('saved');
  });
  it('retains the original eTag for manual byte-only retry and reconciles remote success/cache failure', async () => {
    const service = createSaveService();
    const recovery = createConflictRecoveryService();
    const result: CreateTransferBatchResult = {
      transferIds: [42],
      createdCount: 1,
      persistedAtIso: '2026-10-20T00:00:00Z',
    };
    const dbBytes = Uint8Array.of(1, 2, 3);
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchUploadPendingError(
        { batchResult: result, dbBytes },
        new DatabaseUploadError('upload_failed', 'Upload failed', undefined, 'v1'),
      ),
    );
    vi.mocked(service.retryExportedDatabaseUpload).mockRejectedValueOnce(
      new DatabaseUploadError('remote_commit_cache_failed', 'Cache failed'),
    );
    const controller = createController(service, recovery);
    await controller.submit(createValidFields(), READY_OPTIONS, t);
    expect(controller.getState().canRetry).toBe(true);
    await controller.submit(createValidFields(), READY_OPTIONS, t);
    await controller.retry(t);
    expect(service.createTransferBatchAndExport).toHaveBeenCalledOnce();
    expect(service.retryExportedDatabaseUpload).toHaveBeenCalledWith(
      dbBytes,
      expect.objectContaining({ expectedETag: 'v1' }),
    );
    expect(recovery.syncLatestDatabase).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({ phase: 'saved', canRetry: false });
    await controller.retry(t);
    expect(service.retryExportedDatabaseUpload).toHaveBeenCalledOnce();
  });
  it('blocks offline, invalid context, stale categories and invalidated retries', async () => {
    const service = createSaveService();
    const controller = createController(service);
    await controller.submit(createValidFields(), READY_OPTIONS, t, true);
    expect(service.createTransferBatchAndExport).not.toHaveBeenCalled();
    await controller.submit({ ...createValidFields(), category1Id: 99999 }, READY_OPTIONS, t);
    expect(service.createTransferBatchAndExport).not.toHaveBeenCalled();
    const invalid = createAddTransferSaveController(
      service,
      { show: vi.fn() },
      createConflictRecoveryService(),
      () => ({ ...identity(), isVerifiedCurrent: false }),
    );
    await invalid.submit(createValidFields(), READY_OPTIONS, t);
    invalid.invalidate?.();
    await invalid.retry(t);
    expect(service.createTransferBatchAndExport).not.toHaveBeenCalled();
  });
});
