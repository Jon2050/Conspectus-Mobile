// Verifies OneDrive upload orchestration for exported SQLite snapshots and sync metadata.
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient } from '@graph';
import { createSyncStateStore } from '@shared';

import {
  createDatabaseUploadHandoffService,
  DatabaseUploadError,
} from './databaseUploadHandoffService';

const DRIVE_ITEM_BINDING: DriveItemBinding = {
  driveId: 'drive-1',
  itemId: 'item-1',
  name: 'conspectus.db',
  parentPath: '/Documents',
};

const createSnapshot = (
  overrides: Partial<CachedDatabaseSnapshot> = {},
): CachedDatabaseSnapshot => ({
  binding: DRIVE_ITEM_BINDING,
  metadata: {
    eTag: '"etag-1"',
    lastSyncAtIso: '2026-03-11T09:45:00.000Z',
  },
  dbBytes: Uint8Array.from([1, 2, 3]),
  ...overrides,
});

const createGraphClient = (): Pick<GraphClient, 'uploadFile'> => ({
  uploadFile: vi.fn(async () => ({
    eTag: '"etag-2"',
    sizeBytes: 4,
    lastModifiedDateTime: '2026-03-11T10:00:00Z',
  })),
});

const createCacheStore = (
  snapshot: CachedDatabaseSnapshot | null,
): Pick<CacheStore, 'readSnapshot' | 'writeSnapshot'> => ({
  readSnapshot: vi.fn(async () => snapshot),
  writeSnapshot: vi.fn(async () => {}),
});

describe('database upload handoff service', () => {
  it.each([
    'matching',
    'different_bytes',
    'different_size',
    'unchanged_etag',
    'changed_during_read',
    'changed_binding',
    'read_failed',
  ] as const)(
    'proves a lost upload acknowledgement only from the exact current bytes: %s',
    async (scenario) => {
      const bytes = Uint8Array.of(9, 8, 7);
      let selected = DRIVE_ITEM_BINDING;
      const metadata = {
        eTag: '"etag-2"',
        sizeBytes: scenario === 'different_size' ? bytes.length + 1 : bytes.length,
        lastModifiedDateTime: '2026-10-22T10:00:00Z',
        downloadUrl: 'https://synthetic.invalid/db',
      };
      const graph = {
        ...createGraphClient(),
        getFileMetadata: vi.fn(async () =>
          scenario === 'unchanged_etag' ? { ...metadata, eTag: '"etag-1"' } : metadata,
        ),
        downloadFile: vi.fn(async () => {
          if (scenario === 'read_failed') throw new Error('Injected read failure');
          if (scenario === 'changed_binding') selected = { ...DRIVE_ITEM_BINDING, itemId: 'other' };
          if (scenario === 'changed_during_read')
            graph.getFileMetadata.mockResolvedValue({ ...metadata, eTag: '"etag-3"' });
          return scenario === 'different_bytes' ? Uint8Array.of(1, 2, 3) : bytes.slice();
        }),
      };
      vi.mocked(graph.uploadFile).mockRejectedValue({ code: 'network_error' });
      const cache = createCacheStore(createSnapshot());
      const service = createDatabaseUploadHandoffService(
        graph,
        cache,
        () => selected,
        createSyncStateStore(),
      );
      if (scenario === 'matching') {
        await service.uploadExportedDatabase(bytes);
        expect(cache.writeSnapshot).toHaveBeenCalledWith(
          expect.objectContaining({
            dbBytes: bytes,
            metadata: expect.objectContaining({ eTag: '"etag-2"' }),
          }),
        );
      } else if (scenario === 'changed_binding') {
        // The non-session path still must not promote another binding's result.
        await expect(
          service.uploadExportedDatabase(bytes, {
            context: {
              accountId: 'one',
              binding: DRIVE_ITEM_BINDING,
              baseETag: '"etag-1"',
              runtimeGeneration: 1,
              generation: 1,
            },
          }),
        ).rejects.toMatchObject({ code: 'remote_outcome_unknown' });
        expect(cache.writeSnapshot).not.toHaveBeenCalled();
      } else {
        await expect(service.uploadExportedDatabase(bytes)).rejects.toMatchObject({
          code: 'remote_outcome_unknown',
        });
        expect(cache.writeSnapshot).not.toHaveBeenCalled();
      }
      expect(graph.uploadFile).toHaveBeenCalledOnce();
      if (scenario === 'unchanged_etag' || scenario === 'different_size') {
        expect(graph.downloadFile).not.toHaveBeenCalled();
      }
    },
  );

  it('bounds unknown-result confirmation and aborts stalled reads without promoting the cache', async () => {
    vi.useFakeTimers();
    try {
      const graph = {
        ...createGraphClient(),
        getFileMetadata: vi.fn<GraphClient['getFileMetadata']>(() => new Promise(() => {})),
        downloadFile: vi.fn(),
      };
      vi.mocked(graph.uploadFile).mockRejectedValue({ code: 'network_error' });
      const cache = createCacheStore(createSnapshot());
      const service = createDatabaseUploadHandoffService(
        graph,
        cache,
        () => DRIVE_ITEM_BINDING,
        createSyncStateStore(),
      );
      const result = service.uploadExportedDatabase(Uint8Array.of(9, 8, 7));
      const assertion = expect(result).rejects.toMatchObject({ code: 'remote_outcome_unknown' });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
      expect(graph.getFileMetadata.mock.calls[0]?.[1]?.aborted).toBe(true);
      expect(cache.writeSnapshot).not.toHaveBeenCalled();
      expect(graph.uploadFile).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uploads exported bytes with the cached eTag and refreshes cached sync metadata', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(createSnapshot());
    const syncStateStore = createSyncStateStore({ state: 'synced' });
    const exportedBytes = Uint8Array.from([9, 8, 7, 6]);
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      syncStateStore,
      { now: () => new Date('2026-03-11T10:15:00.000Z') },
    );

    await service.uploadExportedDatabase(exportedBytes);

    expect(cacheStore.readSnapshot).toHaveBeenCalledWith(DRIVE_ITEM_BINDING);
    expect(graphClient.uploadFile).toHaveBeenCalledWith(
      DRIVE_ITEM_BINDING,
      exportedBytes,
      '"etag-1"',
      expect.any(Function),
    );
    expect(cacheStore.writeSnapshot).toHaveBeenCalledWith({
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-2"',
        lastSyncAtIso: '2026-03-11T10:15:00.000Z',
      },
      dbBytes: exportedBytes,
    });
    expect(get(syncStateStore)).toMatchObject({
      state: 'synced',
      branch: 'uploading_database',
      progress: null,
    });
  });

  it('forwards Graph upload progress through the sync store and caller callback', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(createSnapshot());
    const syncStateStore = createSyncStateStore();
    const progressUpdates: Array<{ loadedBytes: number; totalBytes: number | null }> = [];
    vi.mocked(graphClient.uploadFile).mockImplementation(
      async (_binding, _bytes, _expectedETag, onProgress) => {
        onProgress?.(25, 100);
        expect(get(syncStateStore).progress).toEqual({
          loaded: 25,
          total: 100,
          kind: 'upload',
        });
        onProgress?.(50, null);
        expect(get(syncStateStore).progress).toEqual({
          loaded: 50,
          total: null,
          kind: 'upload',
        });

        return {
          eTag: '"etag-2"',
          sizeBytes: 4,
          lastModifiedDateTime: '2026-03-11T10:00:00Z',
        };
      },
    );
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      syncStateStore,
    );

    await service.uploadExportedDatabase(Uint8Array.from([1, 2, 3]), {
      onProgress: (progress) => progressUpdates.push(progress),
    });

    expect(progressUpdates).toEqual([
      { loadedBytes: 25, totalBytes: 100 },
      { loadedBytes: 50, totalBytes: null },
    ]);
  });

  it('surfaces eTag conflicts without rewriting the cache', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(createSnapshot());
    const syncStateStore = createSyncStateStore();
    const conflict = {
      code: 'conflict',
      status: 412,
      message: 'The selected OneDrive file changed on OneDrive. Refresh and try again.',
    };
    vi.mocked(graphClient.uploadFile).mockRejectedValueOnce(conflict);
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      syncStateStore,
    );

    await expect(service.uploadExportedDatabase(Uint8Array.from([1, 2, 3]))).rejects.toMatchObject({
      name: 'DatabaseUploadError',
      code: 'conflict',
      cause: conflict,
      expectedETag: '"etag-1"',
    });

    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
    expect(get(syncStateStore)).toMatchObject({
      state: 'stale',
      branch: 'upload_conflict',
    });
  });

  it('rejects retained bytes when the cached eTag advanced before retry', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(
      createSnapshot({
        metadata: {
          eTag: '"etag-2"',
          lastSyncAtIso: '2026-03-11T10:15:00.000Z',
        },
      }),
    );
    const syncStateStore = createSyncStateStore();
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      syncStateStore,
    );

    await expect(
      service.uploadExportedDatabase(Uint8Array.from([1, 2, 3]), {
        expectedETag: '"etag-1"',
      }),
    ).rejects.toMatchObject({
      name: 'DatabaseUploadError',
      code: 'conflict',
      expectedETag: '"etag-1"',
    });

    expect(graphClient.uploadFile).not.toHaveBeenCalled();
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
    expect(get(syncStateStore)).toMatchObject({ state: 'stale', branch: 'upload_conflict' });
  });

  it('reports a cache recovery requirement after OneDrive accepts the upload', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(createSnapshot());
    vi.mocked(cacheStore.writeSnapshot).mockRejectedValueOnce(
      new Error('IndexedDB is unavailable.'),
    );
    const syncStateStore = createSyncStateStore();
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      syncStateStore,
    );

    await expect(service.uploadExportedDatabase(Uint8Array.from([1, 2, 3]))).rejects.toMatchObject({
      name: 'DatabaseUploadError',
      code: 'remote_commit_cache_failed',
      message:
        'The transfer was saved to OneDrive, but the local database cache could not be refreshed.',
    });

    expect(graphClient.uploadFile).toHaveBeenCalledOnce();
    expect(get(syncStateStore)).toMatchObject({
      state: 'stale',
      branch: 'upload_cache_recovery_required',
    });
  });

  it('fails before upload when no selected binding is available', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(createSnapshot());
    const syncStateStore = createSyncStateStore();
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => null,
      syncStateStore,
    );

    await expect(service.uploadExportedDatabase(Uint8Array.from([1, 2, 3]))).rejects.toBeInstanceOf(
      DatabaseUploadError,
    );

    expect(graphClient.uploadFile).not.toHaveBeenCalled();
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
    expect(get(syncStateStore)).toMatchObject({
      state: 'error',
      branch: 'upload_failed',
    });
  });

  it('fails before upload when cached eTag metadata is missing', async () => {
    const graphClient = createGraphClient();
    const cacheStore = createCacheStore(null);
    const syncStateStore = createSyncStateStore();
    const service = createDatabaseUploadHandoffService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      syncStateStore,
    );

    await expect(service.uploadExportedDatabase(Uint8Array.from([1, 2, 3]))).rejects.toMatchObject({
      name: 'DatabaseUploadError',
      code: 'missing_cached_snapshot',
    });

    expect(graphClient.uploadFile).not.toHaveBeenCalled();
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
    expect(get(syncStateStore)).toMatchObject({
      state: 'error',
      branch: 'upload_failed',
    });
  });
});
