// Verifies duplicate-safe receipt commit, byte-only retry, conflict, and reconciliation states.
import { describe, expect, it, vi } from 'vitest';
import {
  PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  TRANSFER_TYPE_STD_EXPENSE,
  type CreateTransferInput,
} from '@db';
import type { ToastStore } from '@shared';

import { DatabaseUploadError } from './databaseUploadHandoffService';
import type { DatabaseConflictRecoveryService } from './databaseConflictRecoveryService';
import {
  createReceiptTransferCommitController,
  type ReceiptTransferCommitContext,
} from './receiptTransferCommitController';
import {
  TransferBatchExportRecoveryRequiredError,
  TransferBatchUploadPendingError,
  type TransferBatchSaveExportService,
} from './transferSaveExportService';

const command = (name = 'Lebensmittel'): CreateTransferInput =>
  Object.freeze({
    bookingDateEpochDay: 20_665,
    name,
    amountCents: 350,
    transferTypeId: TRANSFER_TYPE_STD_EXPENSE,
    fromAccountId: 11,
    toAccountId: 2,
    categoryIds: Object.freeze([20]),
    buyplace: 'Markt',
  });

const commands = (...names: string[]): readonly CreateTransferInput[] =>
  Object.freeze(names.map((name) => command(name)));

const context = (
  overrides: Partial<ReceiptTransferCommitContext> = {},
): ReceiptTransferCommitContext => ({
  isOnline: true,
  isAuthenticated: true,
  isVerifiedCurrent: true,
  contextKey: 'account|drive|item',
  optionsState: {
    operation: 'ready',
    fromAccountOptions: [{ accountId: 11, name: 'Checking', accountTypeId: 3 }],
    toAccountOptions: [
      { accountId: 2, name: 'Primary Spendings', accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID },
    ],
    categoryOptions: [{ categoryId: 20, name: 'Einkauf' }],
    error: null,
  },
  ...overrides,
});

const saveService = (): TransferBatchSaveExportService => ({
  createTransferAndExport: vi.fn(async () => ({
    transferId: 40,
    persistedAtIso: '2026-07-31T00:00:00.000Z',
  })),
  createTransferBatchAndExport: vi.fn(async (inputs: readonly CreateTransferInput[], options) => {
    options?.onUploadStart?.();
    options?.onProgress?.({ loadedBytes: 5, totalBytes: 10 });
    return {
      transferIds: inputs.map((_, index) => 40 + index),
      createdCount: inputs.length,
      persistedAtIso: '2026-07-31T00:00:00.000Z',
    };
  }),
  retryExportedDatabaseUpload: vi.fn(async () => {}),
});

const recoveryService = (): DatabaseConflictRecoveryService => ({
  discardStaleRuntime: vi.fn(),
  syncLatestDatabase: vi.fn(async () => {}),
});

const toastStore = (): Pick<ToastStore, 'show'> => ({ show: vi.fn() });
const t = (key: string, options?: { readonly values?: Record<string, string | number> }): string =>
  `${key}:${options?.values?.count ?? ''}`;

describe('receipt transfer commit controller', () => {
  it('requires an online authenticated verified-current context before writing', async () => {
    const service = saveService();
    const controller = createReceiptTransferCommitController(
      service,
      recoveryService(),
      toastStore(),
    );

    await controller.commit(commands('Offline'), context({ isOnline: false }), t);

    expect(controller.getState()).toMatchObject({
      phase: 'failed',
      error: { code: 'offline' },
    });
    expect(service.createTransferBatchAndExport).not.toHaveBeenCalled();
  });

  it('commits one immutable batch and reports the exact created count after upload', async () => {
    const service = saveService();
    const toasts = toastStore();
    const controller = createReceiptTransferCommitController(service, recoveryService(), toasts);

    await controller.commit(commands('First', 'Second'), context(), t);

    expect(service.createTransferBatchAndExport).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({ phase: 'saved', createdCount: 2, error: null });
    expect(toasts.show).toHaveBeenCalledWith('addTransfer.receipt.commit.successMany:2', 'success');
  });

  it('retains only exported bytes for transport retry and never repeats the batch write', async () => {
    const service = saveService();
    const dbBytes = Uint8Array.from([1, 2, 3]);
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchUploadPendingError(
        {
          batchResult: {
            transferIds: [40],
            createdCount: 1,
            persistedAtIso: '2026-07-31T00:00:00.000Z',
          },
          dbBytes,
        },
        new DatabaseUploadError('upload_failed', 'Temporary upload failure', undefined, '"etag-1"'),
      ),
    );
    const controller = createReceiptTransferCommitController(
      service,
      recoveryService(),
      toastStore(),
    );

    await controller.commit(commands('Retry'), context(), t);
    expect(controller.getState().phase).toBe('upload_failed');
    await controller.retryUpload(context({ isVerifiedCurrent: false }), t);

    expect(service.createTransferBatchAndExport).toHaveBeenCalledOnce();
    expect(service.retryExportedDatabaseUpload).toHaveBeenCalledOnce();
    expect(service.retryExportedDatabaseUpload).toHaveBeenCalledWith(
      dbBytes,
      expect.objectContaining({ expectedETag: '"etag-1"' }),
    );
    expect(controller.getState().phase).toBe('saved');
  });

  it('refreshes after conflict and waits for an explicit revalidated save retry', async () => {
    const service = saveService();
    vi.mocked(service.createTransferBatchAndExport)
      .mockRejectedValueOnce(
        new TransferBatchUploadPendingError(
          {
            batchResult: {
              transferIds: [40],
              createdCount: 1,
              persistedAtIso: '2026-07-31T00:00:00.000Z',
            },
            dbBytes: Uint8Array.from([1]),
          },
          new DatabaseUploadError('conflict', 'Precondition failed'),
        ),
      )
      .mockResolvedValueOnce({
        transferIds: [41],
        createdCount: 1,
        persistedAtIso: '2026-07-31T00:01:00.000Z',
      });
    const recovery = recoveryService();
    const controller = createReceiptTransferCommitController(service, recovery, toastStore());

    await controller.commit(commands('Conflict'), context(), t);
    expect(controller.getState().phase).toBe('conflict');
    expect(recovery.discardStaleRuntime).toHaveBeenCalledOnce();

    await controller.resolveConflict(async () => context(), t);
    expect(controller.getState().phase).toBe('conflict_ready');
    expect(service.createTransferBatchAndExport).toHaveBeenCalledOnce();

    await controller.retryAfterConflict(context(), t);
    expect(service.createTransferBatchAndExport).toHaveBeenCalledTimes(2);
    expect(controller.getState().phase).toBe('saved');
  });

  it('discards and restores the authoritative runtime after a committed batch export failure', async () => {
    const service = saveService();
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchExportRecoveryRequiredError(
        {
          transferIds: [40],
          createdCount: 1,
          persistedAtIso: '2026-07-31T00:00:00.000Z',
        },
        new Error('Export failed'),
      ),
    );
    const recovery = recoveryService();
    const controller = createReceiptTransferCommitController(service, recovery, toastStore());

    await controller.commit(commands('Unexported'), context(), t);

    expect(recovery.discardStaleRuntime).toHaveBeenCalledOnce();
    expect(recovery.syncLatestDatabase).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      phase: 'failed',
      error: { code: 'local_failed' },
    });
    expect(service.retryExportedDatabaseUpload).not.toHaveBeenCalled();
  });

  it('restores the authoritative runtime when cached upload metadata disappears after commit', async () => {
    const service = saveService();
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchUploadPendingError(
        {
          batchResult: {
            transferIds: [40],
            createdCount: 1,
            persistedAtIso: '2026-07-31T00:00:00.000Z',
          },
          dbBytes: Uint8Array.from([1, 2, 3]),
        },
        new DatabaseUploadError('missing_cached_snapshot', 'Cached metadata disappeared'),
      ),
    );
    const recovery = recoveryService();
    const controller = createReceiptTransferCommitController(service, recovery, toastStore());

    await controller.commit(commands('Missing cache'), context(), t);

    expect(recovery.discardStaleRuntime).toHaveBeenCalledOnce();
    expect(recovery.syncLatestDatabase).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      phase: 'failed',
      error: { code: 'local_failed' },
    });
    expect(service.retryExportedDatabaseUpload).not.toHaveBeenCalled();
  });

  it('keeps writes blocked until failed local-commit recovery succeeds on retry', async () => {
    const service = saveService();
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchExportRecoveryRequiredError(
        {
          transferIds: [40],
          createdCount: 1,
          persistedAtIso: '2026-07-31T00:00:00.000Z',
        },
        new Error('Empty export'),
      ),
    );
    const recovery = recoveryService();
    vi.mocked(recovery.syncLatestDatabase)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(undefined);
    const controller = createReceiptTransferCommitController(service, recovery, toastStore());

    await controller.commit(commands('Recovery retry'), context(), t);
    expect(controller.getState()).toMatchObject({
      phase: 'local_commit_recovery_failed',
      error: { code: 'local_commit_recovery_failed' },
    });

    await controller.retryLocalCommitRecovery(t);
    expect(recovery.discardStaleRuntime).toHaveBeenCalledTimes(2);
    expect(recovery.syncLatestDatabase).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      phase: 'failed',
      error: { code: 'local_failed' },
    });
  });

  it('treats remote success during byte retry as reconciliation, never another upload retry', async () => {
    const service = saveService();
    const dbBytes = Uint8Array.from([1, 2, 3]);
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchUploadPendingError(
        {
          batchResult: {
            transferIds: [40],
            createdCount: 1,
            persistedAtIso: '2026-07-31T00:00:00.000Z',
          },
          dbBytes,
        },
        new DatabaseUploadError('upload_failed', 'Temporary upload failure', undefined, '"etag-1"'),
      ),
    );
    vi.mocked(service.retryExportedDatabaseUpload).mockRejectedValueOnce(
      new DatabaseUploadError('remote_commit_cache_failed', 'Cache failed after remote save'),
    );
    const recovery = recoveryService();
    const controller = createReceiptTransferCommitController(service, recovery, toastStore());

    await controller.commit(commands('Retry remote save'), context(), t);
    await controller.retryUpload(context({ isVerifiedCurrent: false }), t);

    expect(recovery.syncLatestDatabase).toHaveBeenCalledOnce();
    expect(controller.getState().phase).toBe('saved');
    await controller.retryUpload(context(), t);
    expect(service.retryExportedDatabaseUpload).toHaveBeenCalledOnce();
  });

  it('never offers a write retry after remote success plus failed cache reconciliation', async () => {
    const service = saveService();
    vi.mocked(service.createTransferBatchAndExport).mockRejectedValueOnce(
      new TransferBatchUploadPendingError(
        {
          batchResult: {
            transferIds: [40],
            createdCount: 1,
            persistedAtIso: '2026-07-31T00:00:00.000Z',
          },
          dbBytes: Uint8Array.from([1]),
        },
        new DatabaseUploadError('remote_commit_cache_failed', 'Cache failed'),
      ),
    );
    const recovery = recoveryService();
    vi.mocked(recovery.syncLatestDatabase).mockRejectedValueOnce(new Error('Refresh failed'));
    const controller = createReceiptTransferCommitController(service, recovery, toastStore());

    await controller.commit(commands('Remote saved'), context(), t);
    expect(controller.getState()).toMatchObject({
      phase: 'remote_commit_recovery_failed',
      createdCount: 1,
    });
    await controller.retryUpload(context(), t);
    await controller.retryAfterConflict(context(), t);
    expect(service.retryExportedDatabaseUpload).not.toHaveBeenCalled();
    expect(service.createTransferBatchAndExport).toHaveBeenCalledOnce();
  });

  it('ignores a late async completion after the file or account context is invalidated', async () => {
    let finishUpload!: (result: {
      transferIds: readonly number[];
      createdCount: number;
      persistedAtIso: string;
    }) => void;
    const uploadPromise = new Promise<{
      transferIds: readonly number[];
      createdCount: number;
      persistedAtIso: string;
    }>((resolve) => {
      finishUpload = resolve;
    });
    const service = saveService();
    vi.mocked(service.createTransferBatchAndExport).mockImplementationOnce(
      async () => uploadPromise,
    );
    const controller = createReceiptTransferCommitController(
      service,
      recoveryService(),
      toastStore(),
    );

    const pending = controller.commit(commands('Superseded'), context(), t);
    controller.invalidate();
    finishUpload({
      transferIds: [40],
      createdCount: 1,
      persistedAtIso: '2026-07-31T00:00:00.000Z',
    });
    await pending;

    expect(controller.getState()).toMatchObject({
      phase: 'invalidated',
      error: { code: 'context_changed' },
    });
  });
});
