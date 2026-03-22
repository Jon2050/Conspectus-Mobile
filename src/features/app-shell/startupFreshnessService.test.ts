// Verifies the startup freshness decision tree for online/offline cache usage and deterministic fallback states.
import { describe, expect, it, vi } from 'vitest';

import { createStartupFreshnessService } from './startupFreshnessService';

import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient, GraphError, GraphFileMetadata } from '@graph';

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
  downloadUrl: 'https://download.example.com/conspectus.db',
  ...overrides,
});

type AsyncOutcome<Result> = Result | GraphError | Error;

const isGraphErrorOutcome = (value: unknown): value is GraphError =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  'message' in value &&
  typeof (value as { code?: unknown }).code === 'string' &&
  typeof (value as { message?: unknown }).message === 'string';

const createAsyncMock = <Result>(...outcomes: readonly AsyncOutcome<Result>[]) => {
  let callCount = 0;

  return vi.fn(async (): Promise<Result> => {
    const outcome =
      outcomes[Math.min(callCount, outcomes.length - 1)] ?? outcomes[outcomes.length - 1];
    callCount += 1;

    if (outcome === undefined) {
      throw new Error('No async outcome configured for the test mock.');
    }

    if (outcome instanceof Error || isGraphErrorOutcome(outcome)) {
      throw outcome;
    }

    return outcome as Result;
  });
};

const createGraphClient = (
  ...metadataOutcomes: readonly AsyncOutcome<GraphFileMetadata>[]
): Pick<GraphClient, 'getFileMetadata'> => ({
  getFileMetadata: createAsyncMock(...metadataOutcomes),
});

const createSnapshotService = (
  ...snapshotOutcomes: readonly AsyncOutcome<CachedDatabaseSnapshot>[]
) => ({
  downloadAndCacheSnapshot: createAsyncMock(...snapshotOutcomes),
});

const createCacheStore = (
  snapshot: CachedDatabaseSnapshot | null,
): Pick<CacheStore, 'readSnapshot'> => ({
  readSnapshot: vi.fn(async () => snapshot),
});

const createGraphError = (
  code: GraphError['code'],
  message: string,
  status?: number,
): GraphError => ({
  code,
  message,
  ...(status === undefined ? {} : { status }),
});

describe('startup freshness service', () => {
  it('skips startup freshness work when no binding is selected', async () => {
    const graphClient = createGraphClient(createMetadata());
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(createSnapshot());
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
    const snapshotService = createSnapshotService(createSnapshot());
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
    const snapshotService = createSnapshotService(createSnapshot());
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
    const snapshotService = createSnapshotService(createSnapshot());
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
    const snapshotService = createSnapshotService(downloadedSnapshot);
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
      undefined,
    );
  });

  it('falls back to the cached snapshot as stale when metadata refresh fails online', async () => {
    const cachedSnapshot = createSnapshot();
    const graphClient = createGraphClient(new Error('Graph metadata request failed.'));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(createSnapshot());
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
    const snapshotService = createSnapshotService(createSnapshot());
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

  it('surfaces session-expired fallback details when metadata refresh fails with an auth error and cached data exists', async () => {
    const cachedSnapshot = createSnapshot();
    const graphClient = createGraphClient(
      createGraphError(
        'unauthorized',
        'Authentication is required to access the selected OneDrive file.',
        401,
      ),
    );
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(createSnapshot());
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_auth_expired_cached',
      syncState: 'stale',
      snapshot: cachedSnapshot,
      failure: {
        code: 'auth_expired',
        message: 'Authentication is required to access the selected OneDrive file.',
        cause: {
          code: 'unauthorized',
          status: 401,
        },
      },
    });

    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('surfaces a session-expired terminal error when metadata refresh fails with an auth error and no cached data exists', async () => {
    const graphClient = createGraphClient(
      createGraphError(
        'unauthorized',
        'Authentication is required to access the selected OneDrive file.',
        401,
      ),
    );
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(createSnapshot());
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_auth_expired',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'auth_expired',
        message: 'Authentication is required to access the selected OneDrive file.',
        cause: {
          code: 'unauthorized',
          status: 401,
        },
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
    const snapshotService = createSnapshotService(new Error('Fresh snapshot download failed.'));
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

  it('keeps the cached snapshot and marks the session as expired when downloading a fresh snapshot fails with an auth error', async () => {
    const cachedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-old"',
        lastSyncAtIso: '2026-03-10T18:30:00.000Z',
      },
    });
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(
      createGraphError(
        'unauthorized',
        'Authentication is required to access the selected OneDrive file.',
        401,
      ),
    );
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_auth_expired_cached',
      syncState: 'stale',
      snapshot: cachedSnapshot,
      failure: {
        code: 'auth_expired',
        message: 'Authentication is required to access the selected OneDrive file.',
        cause: {
          code: 'unauthorized',
          status: 401,
        },
      },
    });
  });

  it('returns a session-expired terminal error when downloading a fresh snapshot fails with an auth error and no cached data exists', async () => {
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(
      createGraphError(
        'unauthorized',
        'Authentication is required to access the selected OneDrive file.',
        401,
      ),
    );
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService);

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_auth_expired',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'auth_expired',
        message: 'Authentication is required to access the selected OneDrive file.',
        cause: {
          code: 'unauthorized',
          status: 401,
        },
      },
    });
  });

  it('fails when downloading a fresh snapshot fails online and no cached snapshot exists', async () => {
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(new Error('Fresh snapshot download failed.'));
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

  it('retries transient metadata failures with exponential backoff and eventually succeeds', async () => {
    const cachedSnapshot = createSnapshot();
    const graphClient = createGraphClient(
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createMetadata(),
    );
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(createSnapshot());
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_unchanged',
      syncState: 'synced',
      snapshot: cachedSnapshot,
      failure: null,
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(3);
    expect(waitFor).toHaveBeenNthCalledWith(1, 250);
    expect(waitFor).toHaveBeenNthCalledWith(2, 500);
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('retries transient download failures and returns a fresh snapshot once OneDrive recovers', async () => {
    const cachedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-old"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
    });
    const downloadedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-new"',
        lastSyncAtIso: '2026-03-11T10:45:00.000Z',
      },
      dbBytes: Uint8Array.from([8, 8, 8, 8]),
    });
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(
      createGraphError('network_error', 'Temporary download outage.', 503),
      createGraphError('network_error', 'Temporary download outage.', 503),
      downloadedSnapshot,
    );
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_changed',
      syncState: 'synced',
      snapshot: downloadedSnapshot,
      failure: null,
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(1);
    expect(snapshotService.downloadAndCacheSnapshot).toHaveBeenCalledTimes(3);
    expect(waitFor).toHaveBeenNthCalledWith(1, 250);
    expect(waitFor).toHaveBeenNthCalledWith(2, 500);
  });

  it('keeps the cached snapshot as stale after transient download failures exhaust retries', async () => {
    const cachedSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-old"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
    });
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(
      createGraphError('network_error', 'Temporary download outage.', 503),
      createGraphError('network_error', 'Temporary download outage.', 503),
      createGraphError('network_error', 'Temporary download outage.', 503),
    );
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_download_failed_cached',
      syncState: 'stale',
      snapshot: cachedSnapshot,
      failure: {
        code: 'snapshot_download_failed',
        message:
          'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
        cause: {
          code: 'network_error',
          status: 503,
        },
      },
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(1);
    expect(snapshotService.downloadAndCacheSnapshot).toHaveBeenCalledTimes(3);
    expect(waitFor.mock.calls).toEqual([[250], [500]]);
  });

  it('returns an actionable terminal error after transient download failures exhaust retries without cached data', async () => {
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(
      createGraphError('network_error', 'Temporary download outage.', 503),
      createGraphError('network_error', 'Temporary download outage.', 503),
      createGraphError('network_error', 'Temporary download outage.', 503),
    );
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_download_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'snapshot_download_failed',
        message:
          'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
        cause: {
          code: 'network_error',
          status: 503,
        },
      },
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(1);
    expect(snapshotService.downloadAndCacheSnapshot).toHaveBeenCalledTimes(3);
    expect(waitFor.mock.calls).toEqual([[250], [500]]);
  });

  it('fails fast for non-retryable download errors without waiting for retries', async () => {
    const graphClient = createGraphClient(createMetadata({ eTag: '"etag-new"' }));
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(
      createGraphError(
        'forbidden',
        'The app does not have permission to download the selected OneDrive file.',
        403,
      ),
    );
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_download_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'snapshot_download_failed',
        message: 'The app does not have permission to download the selected OneDrive file.',
      },
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(1);
    expect(snapshotService.downloadAndCacheSnapshot).toHaveBeenCalledTimes(1);
    expect(waitFor).not.toHaveBeenCalled();
  });

  it('caps retry backoff delays and returns an actionable final message after transient metadata failures exhaust retries', async () => {
    const graphClient = createGraphClient(
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
    );
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(createSnapshot());
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        maxAttempts: 5,
        initialDelayMs: 200,
        maxDelayMs: 450,
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_metadata_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'metadata_fetch_failed',
        message:
          'Unable to refresh the selected OneDrive database metadata after 5 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
        cause: {
          code: 'network_error',
          status: 503,
        },
      },
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(5);
    expect(waitFor.mock.calls).toEqual([[200], [400], [450], [450]]);
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the cached snapshot as stale after transient metadata failures exhaust retries', async () => {
    const cachedSnapshot = createSnapshot();
    const graphClient = createGraphClient(
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
      createGraphError('network_error', 'Temporary metadata outage.', 503),
    );
    const cacheStore = createCacheStore(cachedSnapshot);
    const snapshotService = createSnapshotService(createSnapshot());
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'ready',
      branch: 'online_metadata_failed_cached',
      syncState: 'stale',
      snapshot: cachedSnapshot,
      failure: {
        code: 'metadata_fetch_failed',
        message:
          'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
        cause: {
          code: 'network_error',
          status: 503,
        },
      },
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(3);
    expect(waitFor.mock.calls).toEqual([[250], [500]]);
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });

  it('fails fast for non-retryable metadata errors without waiting for retries', async () => {
    const graphClient = createGraphClient(
      createGraphError(
        'forbidden',
        'The app does not have permission to access the selected OneDrive file.',
        403,
      ),
    );
    const cacheStore = createCacheStore(null);
    const snapshotService = createSnapshotService(createSnapshot());
    const waitFor = vi.fn(async () => {});
    const service = createStartupFreshnessService(graphClient, cacheStore, snapshotService, {
      retry: {
        waitFor,
      },
    });

    await expect(service.resolve(DRIVE_ITEM_BINDING, true)).resolves.toMatchObject({
      kind: 'error',
      branch: 'online_metadata_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'metadata_fetch_failed',
        message: 'The app does not have permission to access the selected OneDrive file.',
      },
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledTimes(1);
    expect(waitFor).not.toHaveBeenCalled();
    expect(snapshotService.downloadAndCacheSnapshot).not.toHaveBeenCalled();
  });
});
