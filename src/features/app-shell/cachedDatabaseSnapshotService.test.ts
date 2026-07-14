// Verifies downloaded OneDrive DB snapshots are validated before they can replace the cached offline snapshot.
import 'fake-indexeddb/auto';

import { describe, expect, it, vi } from 'vitest';
import { createDexieCacheStore } from '@cache';
import { createBrowserDbRuntime, createSqlJsLoader, SQLITE_DATABASE_HEADER } from '@db';

import {
  createCachedDatabaseSnapshotService,
  createSqliteSnapshotValidator,
  type CachedDatabaseSnapshotValidator,
} from './cachedDatabaseSnapshotService';

import type { CachedDatabaseSnapshot, CacheStore } from '@cache';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';

const createSqliteBytes = (payloadBytes: readonly number[] = [1, 2, 3, 4]): Uint8Array =>
  Uint8Array.from([...SQLITE_DATABASE_HEADER, ...payloadBytes]);

const createMockSnapshotValidator = (): CachedDatabaseSnapshotValidator => ({
  validate: vi.fn(async () => {}),
});

const resolveNodeWasmPath = (): string =>
  `${process.cwd().replaceAll('\\', '/')}/node_modules/sql.js/dist/sql-wasm.wasm`;

const createValidSqliteSnapshotBytes = async (): Promise<Uint8Array> => {
  const sqlJsRuntime = await createSqlJsLoader({
    resolveWasmAssetUrl: resolveNodeWasmPath,
  }).load();
  const database = new sqlJsRuntime.Database();

  database.exec(`
    CREATE TABLE account (account_id INTEGER PRIMARY KEY);
    CREATE TABLE category (category_id INTEGER PRIMARY KEY);
    CREATE TABLE transfer (transfer_id INTEGER PRIMARY KEY);
  `);
  const bytes = database.export();
  database.close();

  return bytes;
};

const DRIVE_ITEM_BINDING: DriveItemBinding = {
  driveId: 'drive-123',
  itemId: 'item-456',
  name: 'conspectus.db',
  parentPath: '/Finance',
};
const DOWNLOAD_URL = 'https://download.example.com/conspectus.db';

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
    const graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'> = {
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async () => dbBytes),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const snapshotValidator = createMockSnapshotValidator();
    const now = new Date('2026-03-11T09:45:00.000Z');
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
      now: () => now,
      snapshotValidator,
    });
    const metadata = createMetadata({}, dbBytes);

    const snapshot = await service.downloadAndCacheSnapshot(DRIVE_ITEM_BINDING, metadata);

    expect(graphClient.getFileDownloadUrl).toHaveBeenCalledWith(DRIVE_ITEM_BINDING);
    expect(graphClient.downloadFile).toHaveBeenCalledWith(DOWNLOAD_URL, undefined);
    expect(snapshot).toEqual<CachedDatabaseSnapshot>({
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-1"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
      dbBytes,
    });
    expect(snapshotValidator.validate).toHaveBeenCalledWith(dbBytes);
    expect(cacheStore.writeSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('rejects empty downloads before they can overwrite the cache', async () => {
    const graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'> = {
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async () => new Uint8Array()),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const snapshotValidator = createMockSnapshotValidator();
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
      snapshotValidator,
    });

    await expect(
      service.downloadAndCacheSnapshot(
        DRIVE_ITEM_BINDING,
        createMetadata({ sizeBytes: 0 }, new Uint8Array()),
      ),
    ).rejects.toThrow('The selected OneDrive database file is empty and cannot be cached.');
    expect(snapshotValidator.validate).not.toHaveBeenCalled();
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
  });

  it('rejects size mismatches before writing a new snapshot', async () => {
    const dbBytes = createSqliteBytes([1, 2, 3]);
    const graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'> = {
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async () => dbBytes),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const snapshotValidator = createMockSnapshotValidator();
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
      snapshotValidator,
    });

    await expect(
      service.downloadAndCacheSnapshot(
        DRIVE_ITEM_BINDING,
        createMetadata({ sizeBytes: dbBytes.length + 5 }, dbBytes),
      ),
    ).rejects.toThrow('The downloaded OneDrive database size did not match the expected metadata.');
    expect(snapshotValidator.validate).not.toHaveBeenCalled();
    expect(cacheStore.writeSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the previous cached snapshot when downloaded bytes fail full SQLite validation', async () => {
    const databaseName = `conspectus-mobile-cache-test-${crypto.randomUUID()}`;
    const cacheStore = createDexieCacheStore({ databaseName });
    const previousBytes = await createValidSqliteSnapshotBytes();
    const previousSnapshot: CachedDatabaseSnapshot = {
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-previous"',
        lastSyncAtIso: '2026-03-10T19:00:00.000Z',
      },
      dbBytes: previousBytes,
    };
    const corruptBytes = createSqliteBytes([0xde, 0xad, 0xbe, 0xef]);
    const graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'> = {
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async () => corruptBytes),
    };
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
      snapshotValidator: createSqliteSnapshotValidator(
        createBrowserDbRuntime(
          createSqlJsLoader({
            resolveWasmAssetUrl: resolveNodeWasmPath,
          }),
        ),
      ),
    });

    try {
      await cacheStore.writeSnapshot(previousSnapshot);

      await expect(
        service.downloadAndCacheSnapshot(
          DRIVE_ITEM_BINDING,
          createMetadata({ sizeBytes: corruptBytes.length }, corruptBytes),
        ),
      ).rejects.toMatchObject({
        name: 'DbRuntimeError',
        code: 'db_open_failed',
      });

      await expect(cacheStore.readSnapshot(DRIVE_ITEM_BINDING)).resolves.toEqual(previousSnapshot);
    } finally {
      cacheStore.closeConnections();
      await deleteDatabase(databaseName);
    }
  });

  it('accepts snapshots that pass real SQLite open and pragma validation', async () => {
    const dbBytes = await createValidSqliteSnapshotBytes();
    const graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'> = {
      getFileDownloadUrl: vi.fn(async () => DOWNLOAD_URL),
      downloadFile: vi.fn(async () => dbBytes),
    };
    const cacheStore: Pick<CacheStore, 'writeSnapshot'> = {
      writeSnapshot: vi.fn(async () => {}),
    };
    const service = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
      snapshotValidator: createSqliteSnapshotValidator(
        createBrowserDbRuntime(
          createSqlJsLoader({
            resolveWasmAssetUrl: resolveNodeWasmPath,
          }),
        ),
      ),
    });

    await expect(
      service.downloadAndCacheSnapshot(DRIVE_ITEM_BINDING, createMetadata({}, dbBytes)),
    ).resolves.toMatchObject({
      binding: DRIVE_ITEM_BINDING,
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes,
    });
    expect(cacheStore.writeSnapshot).toHaveBeenCalledTimes(1);
  });
});
