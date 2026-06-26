import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createBrowserDbRuntime,
  createTransferWriteService,
  createTransferMonthQueryService,
} from '@db';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../../shared/testUtils/dbIntegration';
import {
  createDatabaseUploadHandoffService,
  DatabaseUploadError,
} from './databaseUploadHandoffService';
import {
  createTransferSaveExportService,
  TransferUploadPendingError,
} from './transferSaveExportService';
import { createSyncStateStore } from '../../shared/state/syncStateStore';
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient, GraphError } from '@graph';

describe('TransferSaveExportService Integration', () => {
  let dbRuntime: ReturnType<typeof createBrowserDbRuntime>;
  let syncStateStore: ReturnType<typeof createSyncStateStore>;
  const mockBinding: DriveItemBinding = {
    driveId: 'd1',
    itemId: 'i1',
    name: 'test.db',
    parentPath: '/',
  };

  beforeEach(async () => {
    const loader = createNodeSqlJsRuntimeLoader();
    dbRuntime = createBrowserDbRuntime(loader);
    await dbRuntime.open(loadTransferFixtureBytes());
    syncStateStore = createSyncStateStore();
  });

  it('orchestrates SQL transaction, DB export, and metadata refresh on success', async () => {
    const transferWriteService = createTransferWriteService(dbRuntime);
    const mockGraphClient: Pick<GraphClient, 'uploadFile'> = {
      uploadFile: vi.fn().mockResolvedValue({ eTag: 'new-etag-123' }),
    };

    const mockSnapshot: CachedDatabaseSnapshot = {
      binding: mockBinding,
      metadata: { eTag: 'old-etag', lastSyncAtIso: '2023-01-01T00:00:00.000Z' },
      dbBytes: new Uint8Array([1, 2, 3]),
    };
    const mockCacheStore: Pick<CacheStore, 'readSnapshot' | 'writeSnapshot'> = {
      readSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
      writeSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const uploadHandoff = createDatabaseUploadHandoffService(
      mockGraphClient,
      mockCacheStore,
      () => mockBinding,
      syncStateStore,
    );

    const exportService = createTransferSaveExportService(
      transferWriteService,
      dbRuntime,
      uploadHandoff,
    );

    const input = {
      name: 'Integration Test Transfer',
      fromAccountId: 3, // Girokonto
      toAccountId: 4, // Kreditkarte
      amountCents: 1500,
      bookingDateEpochDay: 19500,
      transferTypeId: 3,
      categoryIds: [1],
      buyplace: 'Supermarket',
    };

    const result = await exportService.createTransferAndExport(input);

    expect(result.transferId).toBeGreaterThan(0);

    // Verify SQL transaction behavior
    const queryService = createTransferMonthQueryService(dbRuntime);
    const transfers = queryService.listTransfersByMonth(19500);
    const inserted = transfers.find((t) => t.transferId === result.transferId);
    expect(inserted).toBeDefined();
    expect(inserted?.name).toBe('Integration Test Transfer');

    // Verify Export and upload handoff
    expect(mockGraphClient.uploadFile).toHaveBeenCalledTimes(1);
    const uploadCall = vi.mocked(mockGraphClient.uploadFile).mock.calls[0]!;
    expect(uploadCall[0]).toEqual(mockBinding);
    expect(uploadCall[1].length).toBeGreaterThan(100); // exported bytes
    expect(uploadCall[2]).toBe('old-etag');

    // Verify metadata refresh
    expect(mockCacheStore.writeSnapshot).toHaveBeenCalledTimes(1);
    const writeCall = vi.mocked(mockCacheStore.writeSnapshot).mock.calls[0]!;
    expect(writeCall[0].metadata.eTag).toBe('new-etag-123');
  });

  it('propagates conflict error when graph client returns precondition failed', async () => {
    const transferWriteService = createTransferWriteService(dbRuntime);
    const conflictError: GraphError & Error = Object.assign(new Error('Conflict'), {
      code: 'conflict' as const,
    });
    const mockGraphClient: Pick<GraphClient, 'uploadFile'> = {
      uploadFile: vi.fn().mockRejectedValue(conflictError),
    };

    const mockSnapshot: CachedDatabaseSnapshot = {
      binding: mockBinding,
      metadata: { eTag: 'old-etag', lastSyncAtIso: '2023-01-01T00:00:00.000Z' },
      dbBytes: new Uint8Array([1, 2, 3]),
    };
    const mockCacheStore: Pick<CacheStore, 'readSnapshot' | 'writeSnapshot'> = {
      readSnapshot: vi.fn().mockResolvedValue(mockSnapshot),
      writeSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const uploadHandoff = createDatabaseUploadHandoffService(
      mockGraphClient,
      mockCacheStore,
      () => mockBinding,
      syncStateStore,
    );

    const exportService = createTransferSaveExportService(
      transferWriteService,
      dbRuntime,
      uploadHandoff,
    );

    const input = {
      name: 'Conflict Transfer',
      fromAccountId: 3,
      toAccountId: 4,
      amountCents: 500,
      bookingDateEpochDay: 19500,
      transferTypeId: 3,
      categoryIds: [],
      buyplace: null,
    };

    let error: unknown;
    try {
      await exportService.createTransferAndExport(input);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(TransferUploadPendingError);
    expect((error as TransferUploadPendingError).cause).toBeInstanceOf(DatabaseUploadError);
    expect(((error as TransferUploadPendingError).cause as DatabaseUploadError).code).toBe(
      'conflict',
    );

    // Verify cache store was not updated due to conflict
    expect(mockCacheStore.writeSnapshot).not.toHaveBeenCalled();
  });
});
