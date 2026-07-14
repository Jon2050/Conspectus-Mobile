// Verifies conflict recovery refreshes OneDrive bytes and replaces the stale SQLite runtime.
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import type { CacheStore } from '@cache';
import { SQLITE_DATABASE_HEADER, type BrowserDbRuntime } from '@db';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';
import { createSyncStateStore } from '@shared';

import {
  createDatabaseConflictRecoveryService,
  type DatabaseConflictRecoveryProgress,
} from './databaseConflictRecoveryService';
import type { CachedDatabaseSnapshotValidator } from './cachedDatabaseSnapshotService';

const DRIVE_ITEM_BINDING: DriveItemBinding = {
  driveId: 'drive-1',
  itemId: 'item-1',
  name: 'conspectus.db',
  parentPath: '/Finance',
};
const DOWNLOAD_URL = 'https://download.example.com/conspectus.db';

const createSqliteBytes = (payloadBytes: readonly number[] = [1, 2, 3, 4]): Uint8Array =>
  Uint8Array.from([...SQLITE_DATABASE_HEADER, ...payloadBytes]);

const createMetadata = (dbBytes: Uint8Array): GraphFileMetadata => ({
  eTag: '"etag-2"',
  sizeBytes: dbBytes.length,
  lastModifiedDateTime: '2026-03-11T10:15:00.000Z',
});

const createSnapshotValidator = (): CachedDatabaseSnapshotValidator => ({
  validate: vi.fn(async () => {}),
});

const createDbRuntime = (calls: string[] = []): Pick<BrowserDbRuntime, 'close' | 'open'> => ({
  close: vi.fn(() => {
    calls.push('close');
  }),
  open: vi.fn(async () => {
    calls.push('open');
  }),
});

describe('database conflict recovery service', () => {
  it('downloads the latest OneDrive database, caches it, and reopens the runtime', async () => {
    const dbBytes = createSqliteBytes([9, 8, 7]);
    const graphClient: Pick<
      GraphClient,
      'getFileMetadata' | 'getFileDownloadUrl' | 'downloadFile'
    > = {
      getFileMetadata: vi.fn(async () => createMetadata(dbBytes)),
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async (_downloadUrl, onProgress) => {
        onProgress?.(5, dbBytes.length);
        onProgress?.(dbBytes.length, dbBytes.length);
        return dbBytes;
      }),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const calls: string[] = [];
    const dbRuntime = createDbRuntime(calls);
    const syncStateStore = createSyncStateStore({ state: 'stale' });
    const progressUpdates: DatabaseConflictRecoveryProgress[] = [];
    const service = createDatabaseConflictRecoveryService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      dbRuntime,
      syncStateStore,
      {
        now: () => new Date('2026-03-11T10:30:00.000Z'),
        snapshotValidator: createSnapshotValidator(),
      },
    );

    await service.syncLatestDatabase({
      onProgress: (progress) => progressUpdates.push(progress),
    });

    expect(graphClient.getFileMetadata).toHaveBeenCalledWith(DRIVE_ITEM_BINDING);
    expect(graphClient.downloadFile).toHaveBeenCalledWith(
      'https://download.example.com/conspectus.db',
      expect.any(Function),
    );
    expect(cacheStore.writeSnapshot).toHaveBeenCalledWith({
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-2"',
        lastSyncAtIso: '2026-03-11T10:30:00.000Z',
      },
      dbBytes,
    });
    expect(dbRuntime.open).toHaveBeenCalledWith(dbBytes);
    expect(calls).toEqual(['close', 'close', 'open']);
    expect(progressUpdates).toEqual([
      { loadedBytes: 5, totalBytes: dbBytes.length },
      { loadedBytes: dbBytes.length, totalBytes: dbBytes.length },
    ]);
    expect(get(syncStateStore)).toMatchObject({
      state: 'synced',
      branch: 'conflict_recovery',
      progress: null,
    });
  });

  it('closes the stale runtime immediately when asked to discard it', () => {
    const dbRuntime = createDbRuntime();
    const service = createDatabaseConflictRecoveryService(
      {
        getFileMetadata: vi.fn(async () => createMetadata(createSqliteBytes())),
        getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
        downloadFile: vi.fn(async () => createSqliteBytes()),
      },
      { writeSnapshot: vi.fn(async () => {}) },
      () => DRIVE_ITEM_BINDING,
      dbRuntime,
      createSyncStateStore({ state: 'stale' }),
      { snapshotValidator: createSnapshotValidator() },
    );

    service.discardStaleRuntime();

    expect(dbRuntime.close).toHaveBeenCalledOnce();
  });

  it('fails without reopening when no OneDrive binding is available', async () => {
    const dbRuntime = createDbRuntime();
    const syncStateStore = createSyncStateStore({ state: 'stale' });
    const service = createDatabaseConflictRecoveryService(
      {
        getFileMetadata: vi.fn(async () => createMetadata(createSqliteBytes())),
        getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
        downloadFile: vi.fn(async () => createSqliteBytes()),
      },
      { writeSnapshot: vi.fn(async () => {}) },
      () => null,
      dbRuntime,
      syncStateStore,
      { snapshotValidator: createSnapshotValidator() },
    );

    await expect(service.syncLatestDatabase()).rejects.toThrow(
      'Cannot refresh because no OneDrive database is selected.',
    );

    expect(dbRuntime.close).toHaveBeenCalledOnce();
    expect(dbRuntime.open).not.toHaveBeenCalled();
    expect(get(syncStateStore)).toMatchObject({
      state: 'error',
      branch: 'conflict_recovery_failed',
    });
  });

  it('keeps the runtime closed when downloaded bytes cannot be opened', async () => {
    const dbBytes = createSqliteBytes([4, 5, 6]);
    const graphClient: Pick<
      GraphClient,
      'getFileMetadata' | 'getFileDownloadUrl' | 'downloadFile'
    > = {
      getFileMetadata: vi.fn(async () => createMetadata(dbBytes)),
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async () => dbBytes),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const dbRuntime = createDbRuntime();
    vi.mocked(dbRuntime.open).mockRejectedValueOnce(new Error('Open failed.'));
    const syncStateStore = createSyncStateStore({ state: 'stale' });
    const service = createDatabaseConflictRecoveryService(
      graphClient,
      cacheStore,
      () => DRIVE_ITEM_BINDING,
      dbRuntime,
      syncStateStore,
      { snapshotValidator: createSnapshotValidator() },
    );

    await expect(service.syncLatestDatabase()).rejects.toThrow('Open failed.');

    expect(dbRuntime.close).toHaveBeenCalledTimes(3);
    expect(get(syncStateStore)).toMatchObject({
      state: 'error',
      branch: 'conflict_recovery_failed',
    });
  });
});
