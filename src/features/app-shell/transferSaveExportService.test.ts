// Verifies that transfer saves export committed SQLite bytes before upload handoff.
import { describe, expect, it, vi } from 'vitest';

import {
  createBrowserDbRuntime,
  createTransferWriteService,
  DbRuntimeError,
  TRANSFER_TYPE_INTERN_TRANSFER,
  type BrowserDbRuntime,
  type CreateTransferInput,
  type CreateTransferResult,
} from '@db';

import { toEpochDay } from '../../shared/testUtils/dateUtils';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../../shared/testUtils/dbIntegration';
import {
  createTransferSaveExportService,
  TransferUploadPendingError,
  type DatabaseUploadHandoff,
} from './transferSaveExportService';

const createRuntimeFromTransferFixture = async (): Promise<BrowserDbRuntime> => {
  const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
  await runtime.open(loadTransferFixtureBytes());
  return runtime;
};

const createBaseInput = (name: string): CreateTransferInput => ({
  bookingDateEpochDay: toEpochDay(2024, 5, 12),
  name,
  amountCents: 1234,
  transferTypeId: TRANSFER_TYPE_INTERN_TRANSFER,
  fromAccountId: 3,
  toAccountId: 4,
  categoryIds: [1],
  buyplace: 'Corner Store',
});

const countTransfersByName = (runtime: Pick<BrowserDbRuntime, 'exec'>, name: string): number => {
  const count = runtime.exec('SELECT COUNT(*) FROM transfer WHERE name = ?;', [name])[0]
    ?.values[0]?.[0];

  if (typeof count !== 'number') {
    throw new Error(`Expected a numeric transfer count for ${name}.`);
  }

  return count;
};

describe('transfer save export service', () => {
  it('writes locally, exports non-empty bytes, and hands them to upload', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const writeService = createTransferWriteService(runtime);
    const uploadedByteSets: Uint8Array[] = [];
    const uploadHandoff: DatabaseUploadHandoff = {
      uploadExportedDatabase: vi.fn(async (dbBytes) => {
        uploadedByteSets.push(dbBytes);
      }),
    };
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    const result = await service.createTransferAndExport(createBaseInput('Exported write'));

    expect(result.transferId).toBeGreaterThan(3);
    expect(uploadHandoff.uploadExportedDatabase).toHaveBeenCalledOnce();
    expect(uploadedByteSets[0]).toBeInstanceOf(Uint8Array);
    expect(uploadedByteSets[0]?.length).toBeGreaterThan(0);
    runtime.close();
  });

  it('runs export and upload only after the local write succeeds', async () => {
    const calls: string[] = [];
    const writeService = {
      createTransfer: vi.fn((input: CreateTransferInput): CreateTransferResult => {
        calls.push(`write:${input.name}`);
        return { transferId: 42, persistedAtIso: '2026-06-25T00:00:00.000Z' };
      }),
    };
    const runtime = {
      exportBytes: vi.fn(() => {
        calls.push('export');
        return Uint8Array.from([1, 2, 3]);
      }),
    };
    const uploadHandoff = {
      uploadExportedDatabase: vi.fn(async () => {
        calls.push('upload');
      }),
    };
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    await expect(
      service.createTransferAndExport(createBaseInput('Ordered write')),
    ).resolves.toEqual({
      transferId: 42,
      persistedAtIso: '2026-06-25T00:00:00.000Z',
    });
    expect(calls).toEqual(['write:Ordered write', 'export', 'upload']);
  });

  it('passes upload progress options to the upload handoff', async () => {
    const writeService = {
      createTransfer: vi.fn(() => ({
        transferId: 42,
        persistedAtIso: '2026-06-25T00:00:00.000Z',
      })),
    };
    const runtime = {
      exportBytes: vi.fn(() => Uint8Array.from([1, 2, 3])),
    };
    const uploadHandoff: DatabaseUploadHandoff = {
      uploadExportedDatabase: vi.fn(async (_dbBytes, options) => {
        options?.onProgress?.({ loadedBytes: 1, totalBytes: 3 });
      }),
    };
    const onProgress = vi.fn();
    const onUploadStart = vi.fn();
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    await service.createTransferAndExport(createBaseInput('Progress write'), {
      onUploadStart,
      onProgress,
    });

    expect(uploadHandoff.uploadExportedDatabase).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]), {
      onUploadStart,
      onProgress,
    });
    expect(onUploadStart).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith({ loadedBytes: 1, totalBytes: 3 });
  });

  it('preserves committed exported bytes when upload fails so retry does not write again', async () => {
    const uploadError = new Error('temporary upload failure');
    const writeService = {
      createTransfer: vi.fn(() => ({
        transferId: 42,
        persistedAtIso: '2026-06-25T00:00:00.000Z',
      })),
    };
    const runtime = {
      exportBytes: vi.fn(() => Uint8Array.from([1, 2, 3])),
    };
    const uploadHandoff: DatabaseUploadHandoff = {
      uploadExportedDatabase: vi
        .fn()
        .mockRejectedValueOnce(uploadError)
        .mockResolvedValueOnce(undefined),
    };
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    const pendingError = await service
      .createTransferAndExport(createBaseInput('Retry upload write'))
      .catch((error: unknown) => error);

    expect(pendingError).toBeInstanceOf(TransferUploadPendingError);
    const retryError = pendingError as TransferUploadPendingError;
    expect(pendingError).toMatchObject({
      pendingUpload: {
        transferResult: {
          transferId: 42,
          persistedAtIso: '2026-06-25T00:00:00.000Z',
        },
        dbBytes: Uint8Array.from([1, 2, 3]),
      },
      cause: uploadError,
    });
    await service.retryExportedDatabaseUpload(retryError.pendingUpload.dbBytes);

    expect(writeService.createTransfer).toHaveBeenCalledOnce();
    expect(runtime.exportBytes).toHaveBeenCalledOnce();
    expect(uploadHandoff.uploadExportedDatabase).toHaveBeenLastCalledWith(
      Uint8Array.from([1, 2, 3]),
      undefined,
    );
  });

  it('does not export or upload when the local write fails', async () => {
    const writeError = new DbRuntimeError('db_query_failed', 'write failed');
    const writeService = {
      createTransfer: vi.fn(() => {
        throw writeError;
      }),
    };
    const runtime = {
      exportBytes: vi.fn(() => Uint8Array.from([1, 2, 3])),
    };
    const uploadHandoff = {
      uploadExportedDatabase: vi.fn(async () => {}),
    };
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    await expect(service.createTransferAndExport(createBaseInput('Failed write'))).rejects.toBe(
      writeError,
    );
    expect(runtime.exportBytes).not.toHaveBeenCalled();
    expect(uploadHandoff.uploadExportedDatabase).not.toHaveBeenCalled();
  });

  it('does not upload when export fails', async () => {
    const exportError = new DbRuntimeError('db_export_failed', 'export failed');
    const writeService = {
      createTransfer: vi.fn(() => ({
        transferId: 42,
        persistedAtIso: '2026-06-25T00:00:00.000Z',
      })),
    };
    const runtime = {
      exportBytes: vi.fn(() => {
        throw exportError;
      }),
    };
    const uploadHandoff = {
      uploadExportedDatabase: vi.fn(async () => {}),
    };
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    await expect(service.createTransferAndExport(createBaseInput('Failed export'))).rejects.toBe(
      exportError,
    );
    expect(uploadHandoff.uploadExportedDatabase).not.toHaveBeenCalled();
  });

  it('rejects an empty export before upload handoff', async () => {
    const writeService = {
      createTransfer: vi.fn(() => ({
        transferId: 42,
        persistedAtIso: '2026-06-25T00:00:00.000Z',
      })),
    };
    const runtime = {
      exportBytes: vi.fn(() => new Uint8Array()),
    };
    const uploadHandoff = {
      uploadExportedDatabase: vi.fn(async () => {}),
    };
    const service = createTransferSaveExportService(writeService, runtime, uploadHandoff);

    await expect(
      service.createTransferAndExport(createBaseInput('Empty export')),
    ).rejects.toMatchObject({
      name: 'DbRuntimeError',
      code: 'db_export_failed',
    });
    expect(uploadHandoff.uploadExportedDatabase).not.toHaveBeenCalled();
  });

  it('exports bytes that can be opened and include the committed transfer', async () => {
    const sourceRuntime = await createRuntimeFromTransferFixture();
    const writeService = createTransferWriteService(sourceRuntime);
    let uploadedBytes: Uint8Array | null = null;
    const uploadHandoff: DatabaseUploadHandoff = {
      uploadExportedDatabase: vi.fn(async (dbBytes) => {
        uploadedBytes = dbBytes;
      }),
    };
    const service = createTransferSaveExportService(writeService, sourceRuntime, uploadHandoff);

    await service.createTransferAndExport(createBaseInput('Reopen exported write'));

    expect(uploadedBytes).not.toBeNull();
    const reopenedRuntime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
    await reopenedRuntime.open(uploadedBytes!);

    expect(countTransfersByName(reopenedRuntime, 'Reopen exported write')).toBe(1);
    sourceRuntime.close();
    reopenedRuntime.close();
  });
});
