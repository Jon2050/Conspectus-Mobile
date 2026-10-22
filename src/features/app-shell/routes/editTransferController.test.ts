import { describe, expect, it, vi } from 'vitest';
import type { TransferRecord } from '@db';
import { createEditTransferController, transferToFormFields } from './editTransferController';
import {
  createTransferSaveExportService,
  type DatabaseUploadHandoff,
} from '../transferSaveExportService';
import { DatabaseUploadError } from '../databaseUploadHandoffService';
import type { AddTransferOptionsState } from './addTransferOptionsController';

const original: TransferRecord = {
  transferId: 2,
  bookingDateEpochDay: 19820,
  name: 'Groceries',
  amountCents: 4599,
  fromAccountId: 3,
  toAccountId: 2,
  categoryIds: [1],
  buyplace: 'Market',
};
const options: AddTransferOptionsState = {
  operation: 'ready',
  error: null,
  fromAccountOptions: [
    { accountId: 3, name: 'Bank', accountTypeId: 3 },
    { accountId: 1, name: 'Income', accountTypeId: 1 },
  ],
  toAccountOptions: [
    { accountId: 2, name: 'Spendings', accountTypeId: 2 },
    { accountId: 3, name: 'Bank', accountTypeId: 3 },
  ],
  categoryOptions: [{ categoryId: 1, name: 'Groceries' }],
};
const t = (key: string) => key;
const setup = () => {
  const mutationService = { updateTransfer: vi.fn(), deleteTransfer: vi.fn() };
  const upload = {
    uploadExportedDatabase: vi.fn<DatabaseUploadHandoff['uploadExportedDatabase']>(async () => {}),
  };
  const exportBytes = vi.fn(() => new Uint8Array([1, 2, 3]));
  const recovery = { discardStaleRuntime: vi.fn(), syncLatestDatabase: vi.fn(async () => {}) };
  const identity = { isAuthenticated: true, isVerifiedCurrent: true, contextKey: 'account|db' };
  const toast = { show: vi.fn() };
  const controller = createEditTransferController(original, {
    mutationService,
    recovery,
    toast,
    resolveIdentity: () => identity,
    createSaveService: (writer) => createTransferSaveExportService(writer, { exportBytes }, upload),
  });
  return { controller, mutationService, upload, exportBytes, identity, recovery, toast };
};

describe('edit transfer controller', () => {
  it('prefills every field with exact cents and an unchanged UTC date', () => {
    expect(transferToFormFields(original)).toEqual({
      date: '2024-04-07',
      name: 'Groceries',
      amount: '45,99€',
      fromAccountId: 3,
      toAccountId: 2,
      category1Id: 1,
      category2Id: -1,
      category3Id: -1,
      buyplace: 'Market',
    });
  });
  it('validates before writing and derives the replacement transfer type', async () => {
    const { controller, mutationService, toast } = setup();
    const fields = transferToFormFields(original);
    expect(await controller.submit({ ...fields, amount: '' }, options, t)).toContain(
      'addTransfer.validation.amountPositive',
    );
    expect(mutationService.updateTransfer).not.toHaveBeenCalled();
    await controller.submit({ ...fields, fromAccountId: 1, toAccountId: 3 }, options, t);
    expect(mutationService.updateTransfer).toHaveBeenCalledWith(
      original,
      expect.objectContaining({
        transferTypeId: 2,
        fromAccountId: 1,
        toAccountId: 3,
        amountCents: 4599,
      }),
    );
    expect(controller.getState().phase).toBe('saved');
    expect(toast.show).toHaveBeenCalledWith('editTransfer.saved', 'success');
  });
  it('deletes the original regardless of invalid unsaved form changes', async () => {
    const { controller, mutationService, toast } = setup();
    await controller.remove(options, t);
    expect(mutationService.deleteTransfer).toHaveBeenCalledExactlyOnceWith(original);
    expect(mutationService.updateTransfer).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('editTransfer.deleted', 'success');
  });
  it.each(['edit', 'delete'] as const)(
    'retries %s upload bytes without repeating SQL or export',
    async (mode) => {
      const { controller, mutationService, upload, exportBytes, toast } = setup();
      upload.uploadExportedDatabase.mockRejectedValueOnce(
        new DatabaseUploadError('upload_failed', 'Temporary failure', undefined, '"base"'),
      );
      if (mode === 'edit') await controller.submit(transferToFormFields(original), options, t);
      else await controller.remove(options, t);
      expect(controller.getState().phase).toBe('upload_failed');
      await controller.remove(options, t); // A pending upload cannot be replaced by another operation.
      await controller.retry(t);
      expect(controller.getState().phase).toBe('saved');
      expect(
        mode === 'edit' ? mutationService.updateTransfer : mutationService.deleteTransfer,
      ).toHaveBeenCalledOnce();
      expect(toast.show).toHaveBeenLastCalledWith(
        mode === 'delete' ? 'editTransfer.deleted' : 'editTransfer.saved',
        'success',
      );
      expect(exportBytes).toHaveBeenCalledOnce();
      expect(upload.uploadExportedDatabase).toHaveBeenCalledTimes(2);
      expect(upload.uploadExportedDatabase.mock.calls[1]?.[0]).toEqual(new Uint8Array([1, 2, 3]));
    },
  );
  it('fails closed offline and after an account change', async () => {
    const { controller, mutationService, upload, identity } = setup();
    await controller.remove(options, t, true);
    expect(mutationService.deleteTransfer).not.toHaveBeenCalled();
    upload.uploadExportedDatabase.mockRejectedValueOnce(
      new DatabaseUploadError('upload_failed', 'Temporary failure', undefined, '"base"'),
    );
    await controller.remove(options, t);
    identity.contextKey = 'another-account|db';
    await controller.retry(t);
    expect(controller.getState().phase).toBe('invalidated');
    expect(upload.uploadExportedDatabase).toHaveBeenCalledOnce();
  });
  it('requires explicit replay after conflict and retains the original comparison snapshot', async () => {
    const { controller, mutationService, upload, recovery } = setup();
    upload.uploadExportedDatabase.mockRejectedValueOnce(
      new DatabaseUploadError('conflict', 'Changed remotely'),
    );
    await controller.remove(options, t);
    expect(controller.getState().phase).toBe('conflict');
    expect(recovery.discardStaleRuntime).toHaveBeenCalledOnce();
    await controller.resolveConflict(async () => options, t);
    expect(controller.getState().phase).toBe('conflict_ready');
    expect(mutationService.deleteTransfer).toHaveBeenCalledOnce();
    await controller.retryAfterConflict(t);
    expect(mutationService.deleteTransfer).toHaveBeenNthCalledWith(2, original);
    expect(controller.getState().phase).toBe('saved');
  });
  it('rejects missing categories without changing the transfer', async () => {
    const { controller, mutationService } = setup();
    await controller.submit({ ...transferToFormFields(original), category1Id: 999 }, options, t);
    expect(controller.getState().phase).toBe('failed');
    expect(mutationService.updateTransfer).not.toHaveBeenCalled();
  });
});
