// Verifies the startup freshness decision tree for online/offline cache usage and deterministic fallback states.
import { describe, expect, it, vi } from 'vitest';

import { createStartupFreshnessService } from './startupFreshnessService';

import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';

const DRIVE_ITEM_BINDING: DriveItemBinding = {
  driveId: 'drive-123',
  itemId: 'item-456',
  name: 'conspectus.db',
  parentPath: '/Finance',
};

const createSnapshot = (
  overrides: Partial<CachedDatabaseSnapshot> = {},
): CachedDatabaseSnapshot => ({
  binding: {
    ...DRIVE_ITEM_BINDING,
    ...(overrides.binding ?? {}),
  },
  metadata: {
    eTag: '"etag-1"',
    lastSyncAtIso: '2026-03-11T09:45:00.000Z',
    ...(overrides.metadata ?? {}),
  },
  dbBytes: overrides.dbBytes ?? Uint8Array.from([1, 2, 3, 4]),
});

const createMetadata = (overrides: Partial<GraphFileMetadata> = {}): GraphFileMetadata => ({
  eTag: '"etag-1"',
  sizeBytes: 2048,
  lastModifiedDateTime: '2026-03-11T10:15:00.000Z',
  ...overrides,
});

const createGraphClient = (
  metadataResult: GraphFileMetadata | Error,
): Pick<GraphClient, 'getFileMetadata'> => ({
  getFileMetadata: vi.fn(async () => {
    if (metadataResult instanceof Error) {
      throw metadataResult;
    }

    return metadataResult;
  }),
});

const createCacheStore = (
  snapshot: CachedDatabaseSnapshot | null,
): Pick<CacheStore, 'readSnapshot'> => ({
  readSnapshot: vi.fn(async () => snapshot),
});

describe('startup freshness service', () => {
  it('skips startup freshness work when no binding is selected', async () => {
    const graphClient = createGraphClient(createMetadata());
    const cacheStore = createCacheStore(null);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(null, true)).resolves.toEqual({
      kind: 'skipped',
      branch: 'no_binding',
      syncState: 'idle',
      snapshot: null,
      failure: null,
    });

    expect(cacheStore.readSnapshot).not.toHaveBeenCalled();
    expect(graphClient.getFileMetadata).not.toHaveBeenCalled();
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('uses the cached snapshot while offline', async () => {
    const cachedSnapshot = createSnapshot();
    const graphClient = createGraphClient(createMetadata());
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, false)).resolves.toEqual({
      kind: 'ready',
      branch: 'offline_cached',
      syncState: 'offline',
      snapshot: cachedSnapshot,
      failure: null,
    });

    expect(graphClient.getFileMetadata).not.toHaveBeenCalled();
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('fails deterministically when offline without a cached snapshot', async () => {
    const graphClient = createGraphClient(createMetadata());
    const cacheStore = createCacheStore(null);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, false)).resolves.toMatchObject({
      kind: 'error',
      branch: 'offline_missing_cache',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'offline_cache_missing',
        message: 'No cached OneDrive database is available while offline.',
      },
    });

    expect(graphClient.getFileMetadata).not.toHaveBeenCalled();
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('reuses the cached snapshot when the OneDrive eTag is unchanged', async () => {
    const cachedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-unchanged"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
    });
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-unchanged"' }));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toEqual({
      kind: 'ready',
      branch: 'online_unchanged',
      syncState: 'synced',
      snapshot: cachedSnapshot,
      failure: null,
    });

    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('downloads and returns a fresh snapshot when the OneDrive eTag changed', async () => {
    const cachedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-old"',
        lastSyncAtIso: '2026-03-10T18:30:00.000Z',
      },
    });
    const downloadedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-new"',
        lastSyncAtIso: '2026-03-11T10:45:00.000Z',
      },
      dbBytes: Uint8Array.from([9, 8, 7, 6]),
    });
    const metadata = createMetadata({ eTag: '"etag-new"' });
    const graphClient = createGraphClient(metadata);
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(async () => downloadedSnapshot),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toEqual({
      kind: 'ready',
      branch: 'online_changed',
      syncState: 'synced',
      snapshot: downloadedSnapshot,
      failure: null,
    });

    expect(snapshotService.downloadAndCacheSnapshot).toHaveBeenCalledWith(
      DRIVE_ITEM_BINDING,
      metadata,
    );
  });

  it('falls back to the cached snapshot as stale when metadata refresh fails online', async () => {
    const cachedSnapshot = createSnapshot();
    const graphClient = createGraphClient(new Error('Graph metadata request failed.'));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_metadata_failed_cached',
      syncState: 'stale',
      snapshot: cachedSnapshot,
      failure: {
        code: 'metadata_fetch_failed',
        message: 'Graph metadata request failed.',
      },
    });

    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('fails when metadata refresh fails online and no cached snapshot exists', async () => {
    const graphClient = createGraphClient(new Error('Graph metadata request failed.'));
    const cacheStore = createCacheStore(null);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_metadata_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'metadata_fetch_failed',
        message: 'Graph metadata request failed.',
      },
    });

    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to the cached snapshot as stale when downloading a fresh snapshot fails online', async () => {
    const cachedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-old"',
        lastSyncAtIso: '2026-03-10T18:30:00.000Z',
      },
    });
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(async () => {
        throw new Error('Fresh snapshot download failed.');
      }),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_download_failed_cached',
      syncState: 'stale',
      snapshot: cachedSnapshot,
      failure: {
        code: 'snapshot_download_failed',
        message: 'Fresh snapshot download failed.',
      },
    });
  });

  it('fails when downloading a fresh snapshot fails online and no cached snapshot exists', async () => {
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(null);
    const snapshotService = {
      downloadAndCacheSnapshot: vi.fn(async () => {
        throw new Error('Fresh snapshot download failed.');
      }),
    };
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_download_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'snapshot_download_failed',
        message: 'Fresh snapshot download failed.',
      },
    });
  });
});
