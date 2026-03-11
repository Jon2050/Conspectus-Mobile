// Implements the Dexie-backed IndexedDB cache store used for DB snapshot persistence and sync metadata.
import Dexie, { type Table } from 'dexie';

import type { CacheStore, CachedDatabaseSnapshot, CachedFileBinding } from './index';

const DEFAULT_CACHE_DATABASE_NAME = 'conspectus-mobile-cache';
const CACHE_SCHEMA_VERSION = 1;

interface CachedDatabaseBytesRecord {
  readonly driveId: string;
  readonly itemId: string;
  readonly dbBytes: Uint8Array;
}

interface CachedSyncMetadataRecord {
  readonly driveId: string;
  readonly itemId: string;
  readonly name: string;
  readonly parentPath: string;
  readonly eTag: string;
  readonly lastSyncAtIso: string;
}

class ConspectusCacheDatabase extends Dexie {
  databaseSnapshots!: Table<CachedDatabaseBytesRecord, [string, string]>;
  syncMetadata!: Table<CachedSyncMetadataRecord, [string, string]>;

  constructor(databaseName: string) {
    super(databaseName);

    // Future schema updates must add a new version block with an explicit upgrade callback.
    this.version(CACHE_SCHEMA_VERSION).stores({
      databaseSnapshots: '[driveId+itemId], driveId, itemId',
      syncMetadata: '[driveId+itemId], driveId, itemId, eTag, lastSyncAtIso',
    });
  }
}

const toBindingKey = (binding: Pick<CachedFileBinding, 'driveId' | 'itemId'>): [string, string] => [
  binding.driveId,
  binding.itemId,
];

const cloneBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);

export interface CreateDexieCacheStoreOptions {
  readonly databaseName?: string;
}

export interface DexieCacheStore extends CacheStore {
  closeConnections(): void;
}

export const createDexieCacheStore = (
  options: CreateDexieCacheStoreOptions = {},
): DexieCacheStore => {
  const database = new ConspectusCacheDatabase(options.databaseName ?? DEFAULT_CACHE_DATABASE_NAME);

  const ensureDatabaseOpen = async (): Promise<void> => {
    if (!database.isOpen()) {
      await database.open();
    }
  };

  return {
    async readSnapshot(binding): Promise<CachedDatabaseSnapshot | null> {
      await ensureDatabaseOpen();
      const bindingKey = toBindingKey(binding);
      const [databaseSnapshot, syncMetadata] = await database.transaction(
        'r',
        database.databaseSnapshots,
        database.syncMetadata,
        async () =>
          Promise.all([
            database.databaseSnapshots.get(bindingKey),
            database.syncMetadata.get(bindingKey),
          ]),
      );

      if (databaseSnapshot === undefined || syncMetadata === undefined) {
        return null;
      }

      return {
        binding: {
          driveId: syncMetadata.driveId,
          itemId: syncMetadata.itemId,
          name: syncMetadata.name,
          parentPath: syncMetadata.parentPath,
        },
        metadata: {
          eTag: syncMetadata.eTag,
          lastSyncAtIso: syncMetadata.lastSyncAtIso,
        },
        dbBytes: cloneBytes(databaseSnapshot.dbBytes),
      };
    },
    async writeSnapshot(snapshot): Promise<void> {
      await ensureDatabaseOpen();

      await database.transaction(
        'rw',
        database.databaseSnapshots,
        database.syncMetadata,
        async () => {
          await database.databaseSnapshots.put({
            driveId: snapshot.binding.driveId,
            itemId: snapshot.binding.itemId,
            dbBytes: cloneBytes(snapshot.dbBytes),
          });
          await database.syncMetadata.put({
            driveId: snapshot.binding.driveId,
            itemId: snapshot.binding.itemId,
            name: snapshot.binding.name,
            parentPath: snapshot.binding.parentPath,
            eTag: snapshot.metadata.eTag,
            lastSyncAtIso: snapshot.metadata.lastSyncAtIso,
          });
        },
      );
    },
    async clearSnapshot(binding): Promise<void> {
      await ensureDatabaseOpen();
      const bindingKey = toBindingKey(binding);

      await database.transaction(
        'rw',
        database.databaseSnapshots,
        database.syncMetadata,
        async () => {
          await database.databaseSnapshots.delete(bindingKey);
          await database.syncMetadata.delete(bindingKey);
        },
      );
    },
    async clearAll(): Promise<void> {
      await ensureDatabaseOpen();

      await database.transaction(
        'rw',
        database.databaseSnapshots,
        database.syncMetadata,
        async () => {
          await database.databaseSnapshots.clear();
          await database.syncMetadata.clear();
        },
      );

      database.close();
    },
    closeConnections(): void {
      database.close();
    },
  };
};

const defaultDexieCacheStore = createDexieCacheStore();

export const appCacheStore: CacheStore = defaultDexieCacheStore;

export const closeAppCacheStoreConnections = (): void => {
  defaultDexieCacheStore.closeConnections();
};
