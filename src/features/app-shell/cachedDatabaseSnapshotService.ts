// Downloads a OneDrive SQLite DB snapshot, validates its integrity, and persists it for later offline/startup reads.
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';

const SQLITE_DATABASE_HEADER = Uint8Array.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

export interface CachedDatabaseSnapshotService {
  downloadAndCacheSnapshot(
    binding: DriveItemBinding,
    metadata: GraphFileMetadata,
    onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
  ): Promise<CachedDatabaseSnapshot>;
}

export interface CreateCachedDatabaseSnapshotServiceOptions {
  readonly now?: () => Date;
}

const matchesSqliteHeader = (bytes: Uint8Array): boolean => {
  if (bytes.length < SQLITE_DATABASE_HEADER.length) {
    return false;
  }

  return SQLITE_DATABASE_HEADER.every((expectedByte, index) => bytes[index] === expectedByte);
};

const validateDownloadedBytes = (bytes: Uint8Array, metadata: GraphFileMetadata): void => {
  if (metadata.sizeBytes <= 0) {
    throw new Error('The selected OneDrive database file is empty and cannot be cached.');
  }

  if (bytes.length === 0) {
    throw new Error('The downloaded OneDrive database file was empty and could not be cached.');
  }

  if (bytes.length !== metadata.sizeBytes) {
    throw new Error('The downloaded OneDrive database size did not match the expected metadata.');
  }

  if (!matchesSqliteHeader(bytes)) {
    throw new Error('The downloaded OneDrive database payload is not a valid SQLite file.');
  }
};

export const createCachedDatabaseSnapshotService = (
  graphClient: Pick<GraphClient, 'downloadFile'>,
  cacheStore: Pick<CacheStore, 'writeSnapshot'>,
  options: CreateCachedDatabaseSnapshotServiceOptions = {},
): CachedDatabaseSnapshotService => {
  const now = options.now ?? (() => new Date());

  return {
    async downloadAndCacheSnapshot(
      binding: DriveItemBinding,
      metadata: GraphFileMetadata,
      onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    ): Promise<CachedDatabaseSnapshot> {
      const dbBytes = await graphClient.downloadFile(binding, onProgress);
      validateDownloadedBytes(dbBytes, metadata);

      const snapshot: CachedDatabaseSnapshot = {
        binding,
        metadata: {
          eTag: metadata.eTag,
          lastSyncAtIso: now().toISOString(),
        },
        dbBytes,
      };

      await cacheStore.writeSnapshot(snapshot);

      return snapshot;
    },
  };
};
