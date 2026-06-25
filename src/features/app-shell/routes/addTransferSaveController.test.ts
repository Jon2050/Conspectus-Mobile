// Verifies Add Transfer save-state orchestration, upload retry behavior, and toast feedback.
import { describe, expect, it, vi } from 'vitest';

import { DatabaseUploadError } from '../databaseUploadHandoffService';
import {
  TransferUploadPendingError,
  type DatabaseUploadOptions,
  type TransferSaveExportService,
} from '../transferSaveExportService';
import type { CreateTransferInput, CreateTransferResult } from '@db';
import {
  createInitialFormFields,
  NO_CATEGORY_SELECTED,
  type AddTransferFormFields,
} from './addTransferFormState';
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
  amount: '12,34',
  fromAccountId: 3,
  toAccountId: 4,
  category1Id: 7,
  category2Id: NO_CATEGORY_SELECTED,
  category3Id: NO_CATEGORY_SELECTED,
  buyplace: 'Market',
});

const createSaveService = (): TransferSaveExportService => ({
  createTransferAndExport: vi.fn(async (_input, options) => {
    options?.onUploadStart?.();
    options?.onProgress?.({ loadedBytes: 5, totalBytes: 10 });
    return { transferId: 42, persistedAtIso: '2026-06-25T00:00:00.000Z' };
  }),
  retryExportedDatabaseUpload: vi.fn(async (_dbBytes, options) => {
    options?.onUploadStart?.();
    options?.onProgress?.({ loadedBytes: 10, totalBytes: 10 });
  }),
});

const collectStates = (
  controller: ReturnType<typeof createAddTransferSaveController>,
): AddTransferSaveState[] => {
  const states: AddTransferSaveState[] = [];
  controller.subscribe((state) => {
    states.push(state);
  });
  return states;
};

describe('addTransferSaveController', () => {
  it('returns validation errors without invoking the save service', async () => {
    const saveService = createSaveService();
    const toastStore = { show: vi.fn() };
    const controller = createAddTransferSaveController(saveService, toastStore);
    const invalidFields = { ...createValidFields(), name: 'No' };

    const result = await controller.submit(invalidFields, READY_OPTIONS, t);

    expect(result.validationErrors).toContain('addTransfer.validation.nameLength');
    expect(saveService.createTransferAndExport).not.toHaveBeenCalled();
    expect(toastStore.show).not.toHaveBeenCalled();
  });

  it('maps validated fields into a transfer input and reports success after upload resolves', async () => {
    const saveService = createSaveService();
    const toastStore = { show: vi.fn() };
    const controller = createAddTransferSaveController(saveService, toastStore);
    const states = collectStates(controller);

    const result = await controller.submit(createValidFields(), READY_OPTIONS, t);

    expect(result.validationErrors).toEqual([]);
    expect(saveService.createTransferAndExport).toHaveBeenCalledWith(
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
      expect.objectContaining({
        onUploadStart: expect.any(Function),
        onProgress: expect.any(Function),
      }),
    );
    expect(states.map((state) => state.phase)).toEqual([
      'idle',
      'local_save',
      'uploading',
      'uploading',
      'saved',
    ]);
    expect(toastStore.show).toHaveBeenCalledWith('addTransfer.save.successToast', 'success');
  });

  it('does not report success before a slow upload promise resolves', async () => {
    let resolveUpload: () => void = () => {};
    const saveService: TransferSaveExportService = {
      createTransferAndExport: vi.fn(
        (_input: CreateTransferInput, options?: DatabaseUploadOptions) =>
          new Promise<CreateTransferResult>((resolve) => {
            options?.onUploadStart?.();
            resolveUpload = () =>
              resolve({ transferId: 42, persistedAtIso: '2026-06-25T00:00:00.000Z' });
          }),
      ),
      retryExportedDatabaseUpload: vi.fn(async () => {}),
    };
    const toastStore = { show: vi.fn() };
    const controller = createAddTransferSaveController(saveService, toastStore);

    const submitPromise = controller.submit(createValidFields(), READY_OPTIONS, t);
    await Promise.resolve();

    expect(controller.getState().phase).toBe('uploading');
    expect(toastStore.show).not.toHaveBeenCalled();

    resolveUpload();
    await submitPromise;

    expect(controller.getState().phase).toBe('saved');
    expect(toastStore.show).toHaveBeenCalledWith('addTransfer.save.successToast', 'success');
  });

  it('preserves failed upload state and retries exported bytes without re-submitting fields', async () => {
    const pendingBytes = Uint8Array.from([1, 2, 3]);
    const saveService: TransferSaveExportService = {
      createTransferAndExport: vi.fn(async (_input, options) => {
        options?.onUploadStart?.();
        throw new TransferUploadPendingError(
          {
            transferResult: { transferId: 42, persistedAtIso: '2026-06-25T00:00:00.000Z' },
            dbBytes: pendingBytes,
          },
          new DatabaseUploadError('upload_failed', 'Network dropped.'),
        );
      }),
      retryExportedDatabaseUpload: vi.fn(async (_dbBytes, options) => {
        options?.onUploadStart?.();
      }),
    };
    const toastStore = { show: vi.fn() };
    const controller = createAddTransferSaveController(saveService, toastStore);
    const fields = createValidFields();

    await controller.submit(fields, READY_OPTIONS, t);

    expect(controller.getState()).toMatchObject({
      phase: 'upload_failed',
      errorMessage: 'Network dropped.',
      canRetry: true,
    });
    expect(fields).toEqual(createValidFields());

    await controller.retry(t);

    expect(saveService.createTransferAndExport).toHaveBeenCalledOnce();
    expect(saveService.retryExportedDatabaseUpload).toHaveBeenCalledWith(
      pendingBytes,
      expect.objectContaining({
        onUploadStart: expect.any(Function),
        onProgress: expect.any(Function),
      }),
    );
    expect(controller.getState().phase).toBe('saved');
  });

  it('ignores duplicate submissions while a save is active', async () => {
    let resolveUpload: () => void = () => {};
    const saveService: TransferSaveExportService = {
      createTransferAndExport: vi.fn(
        (_input: CreateTransferInput, options?: DatabaseUploadOptions) =>
          new Promise<CreateTransferResult>((resolve) => {
            options?.onUploadStart?.();
            resolveUpload = () =>
              resolve({ transferId: 42, persistedAtIso: '2026-06-25T00:00:00.000Z' });
          }),
      ),
      retryExportedDatabaseUpload: vi.fn(async () => {}),
    };
    const controller = createAddTransferSaveController(saveService, { show: vi.fn() });

    const firstSubmit = controller.submit(createValidFields(), READY_OPTIONS, t);
    await Promise.resolve();
    await controller.submit(createValidFields(), READY_OPTIONS, t);

    expect(saveService.createTransferAndExport).toHaveBeenCalledOnce();

    resolveUpload();
    await firstSubmit;
  });

  it('does not offer direct retry for upload conflicts', async () => {
    const saveService: TransferSaveExportService = {
      createTransferAndExport: vi.fn(async (_input, options) => {
        options?.onUploadStart?.();
        throw new TransferUploadPendingError(
          {
            transferResult: { transferId: 42, persistedAtIso: '2026-06-25T00:00:00.000Z' },
            dbBytes: Uint8Array.from([1, 2, 3]),
          },
          new DatabaseUploadError('conflict', 'OneDrive changed.'),
        );
      }),
      retryExportedDatabaseUpload: vi.fn(async () => {}),
    };
    const toastStore = { show: vi.fn() };
    const controller = createAddTransferSaveController(saveService, toastStore);

    await controller.submit(createValidFields(), READY_OPTIONS, t);

    expect(controller.getState()).toMatchObject({
      phase: 'conflict',
      errorMessage: 'OneDrive changed.',
      canRetry: false,
    });
    expect(toastStore.show).toHaveBeenCalledWith('addTransfer.save.conflictToast', 'error');
  });

  it('returns empty validation errors and blocks submit when isOffline is true', async () => {
    const saveService = createSaveService();
    const controller = createAddTransferSaveController(saveService, { show: vi.fn() });
    const result = await controller.submit(createValidFields(), READY_OPTIONS, t, true);
    expect(result.validationErrors).toEqual([]);
    expect(saveService.createTransferAndExport).not.toHaveBeenCalled();
  });

  it('blocks retry when isOffline is true', async () => {
    const saveService = createSaveService();
    const controller = createAddTransferSaveController(saveService, { show: vi.fn() });
    await controller.retry(t, true);
    expect(saveService.retryExportedDatabaseUpload).not.toHaveBeenCalled();
  });
});
