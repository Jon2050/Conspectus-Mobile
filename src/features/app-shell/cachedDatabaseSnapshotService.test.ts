// Verifies downloaded OneDrive DB snapshots are validated before they can replace the cached offline snapshot.
import 'fake-indexeddb/auto';

import { describe, expect, it, vi } from 'vitest';
import { createDexieCacheStore } from '@cache';

import { createCachedDatabaseSnapshotService } from './cachedDatabaseSnapshotService';

import type { CachedDatabaseSnapshot, CacheStore } from '@cache';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';

const SQLITE_DATABASE_HEADER_BYTES = Uint8Array.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

const createSqliteBytes = (payloadBytes: readonly number[] = [1, 2, 3, 4]): Uint8Array =>
  Uint8Array.from([...SQLITE_DATABASE_HEADER_BYTES, ...payloadBytes]);

const DRIVE_ITEM_BINDING: DriveItemBinding = {
  driveId: 'drive-123',
  itemId: 'item-456',
  name: 'conspectus.db',
  parentPath: '/Finance',
};

const createMetadata = (
  overrides: Partial<GraphFileMetadata> = {},
  defaultBytes = createSqliteBytes(),
): GraphFileMetadata => ({
  eTag: '"etag-1"',
  sizeBytes: defaultBytes.length,
  lastModifiedDateTime: '2026-03-11T08:30:00.000Z',
  ...overrides,
});

const deleteDatabase = async (databaseName: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${databaseName}.`));
    request.onblocked = () => reject(new Error(`Deleting ${databaseName} was blocked.`));
  });
};

describe('cached database snapshot service', () => {
  it('downloads a fresh OneDrive DB and persists the validated snapshot', async () => {
    const dbBytes = createSqliteBytes([9, 8, 7]);
    const graphClient: Pick<GraphClient, 'downloadFile'> = {
      downloadFile: vi.fn(async () => dbBytes),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const now = new Date('2026-03-11T09:45:00.000Z');
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
      now: () => now,
    });
    const metadata = createMetadata({}, dbBytes);

    const snapshot = await service.downloadAndCacheSnapshot(DRIVE_ITEM_BINDING, metadata);

    expect(graphClient.downloadFile).toHaveBeenCalledWith(DRIVE_ITEM_BINDING, undefined);
    expect(snapshot).toEqual<CachedDatabaseSnapshot>({
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-1"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
      dbBytes,
    });
    expect(cacheStore.writeSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('rejects empty downloads before they can overwrite the cache', async () => {
    const graphClient: Pick<GraphClient, 'downloadFile'> = {
      downloadFile: vi.fn(async () => new Uint8Array()),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore);

    await expect(
      service.downloadAndCacheSnapshot(
        DRIVE_ITEM_BINDING,
        createMetadata({ sizeBytes: 0 }, new Uint8Array()),
      ),
    ).rejects.toThrow('The selected OneDrive database file is empty and cannot be cached.');
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
  });

  it('rejects size mismatches before writing a new snapshot', async () => {
    const dbBytes = createSqliteBytes([1, 2, 3]);
    const graphClient: Pick<GraphClient, 'downloadFile'> = {
      downloadFile: vi.fn(async () => dbBytes),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore);

    await expect(
      service.downloadAndCacheSnapshot(
        DRIVE_ITEM_BINDING,
        createMetadata({ sizeBytes: dbBytes.length + 5 }, dbBytes),
      ),
    ).rejects.toThrow('The downloaded OneDrive database size did not match the expected metadata.');
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the previous cached snapshot when the downloaded bytes are corrupt', async () => {
    const databaseName = `conspectus-mobile-cache-test-${crypto.randomUUID()}`;
    const cacheStore = createDexieCacheStore({ databaseName });
    const previousSnapshot: CachedDatabaseSnapshot = {
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-previous"',
        lastSyncAtIso: '2026-03-10T19:00:00.000Z',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    };
    const corruptBytes = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    const graphClient: Pick<GraphClient, 'downloadFile'> = {
      downloadFile: vi.fn(async () => corruptBytes),
    };
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore);

    try {
      await cacheStore.writeSnapshot(previousSnapshot);

      await expect(
        service.downloadAndCacheSnapshot(
          DRIVE_ITEM_BINDING,
          createMetadata({ sizeBytes: corruptBytes.length }, corruptBytes),
        ),
      ).rejects.toThrow('The downloaded OneDrive database payload is not a valid SQLite file.');

      await expect(cacheStore.readSnapshot(DRIVE_ITEM_BINDING)).resolves.toEqual(previousSnapshot);
    } finally {
      cacheStore.closeConnections();
      await deleteDatabase(databaseName);
    }
  });
});
