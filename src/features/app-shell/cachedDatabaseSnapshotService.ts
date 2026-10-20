import { measurePhase } from '@shared';
// Downloads a OneDrive SQLite DB snapshot, validates its integrity, and caches it for verified startup reuse.
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import { DbRuntimeError, hasSqliteHeader } from '@db';
import type { CachedDatabaseSnapshotValidator } from '@db';
export { createSqliteSnapshotValidator, type CachedDatabaseSnapshotValidator } from '@db';
import { createSqliteSnapshotValidator } from '@db';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';

export interface CachedDatabaseSnapshotService {
  downloadAndCacheSnapshot(
    binding: DriveItemBinding,
    metadata: GraphFileMetadata,
    onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    signal?: AbortSignal,
  ): Promise<CachedDatabaseSnapshot>;
}

export interface CreateCachedDatabaseSnapshotServiceOptions {
  readonly now?: () => Date;
  readonly snapshotValidator?: CachedDatabaseSnapshotValidator;
}

const validateDownloadedBytes = (bytes: Uint8Array, metadata: GraphFileMetadata): void => {
  if (metadata.sizeBytes <= 0) {
    throw new DbRuntimeError(
      'db_open_failed',
      'The selected OneDrive database file is empty and cannot be cached.',
    );
  }

  if (bytes.length === 0) {
    throw new Error('The downloaded OneDrive database file was empty and could not be cached.');
  }

  if (bytes.length !== metadata.sizeBytes) {
    throw new Error('The downloaded OneDrive database size did not match the expected metadata.');
  }

  if (!hasSqliteHeader(bytes)) {
    throw new DbRuntimeError(
      'db_open_failed',
      'The downloaded OneDrive database payload is not a valid SQLite file.',
    );
  }
};

export class SnapshotCacheError extends Error {
  constructor(cause: unknown) {
    super('The local snapshot cache is unavailable.', { cause });
    this.name = 'SnapshotCacheError';
  }
}

export class SnapshotVersionError extends Error {
  constructor() {
    super('The remote database changed during download.');
    this.name = 'SnapshotVersionError';
  }
}

export const createCachedDatabaseSnapshotService = (
  graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'> &
    Partial<Pick<GraphClient, 'getFileMetadata'>>,
  cacheStore: Pick<CacheStore, 'writeSnapshot'>,
  options: CreateCachedDatabaseSnapshotServiceOptions = {},
): CachedDatabaseSnapshotService => {
  const now = options.now ?? (() => new Date());
  const snapshotValidator = options.snapshotValidator ?? createSqliteSnapshotValidator();

  return {
    async downloadAndCacheSnapshot(
      binding: DriveItemBinding,
      metadata: GraphFileMetadata,
      onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
      signal?: AbortSignal,
    ): Promise<CachedDatabaseSnapshot> {
      const downloadUrl =
        metadata.downloadUrl ?? (await graphClient.getFileDownloadUrl(binding, signal));
      const dbBytes = await measurePhase('download', () =>
        graphClient.downloadFile(downloadUrl, onProgress, signal),
      );
      signal?.throwIfAborted();
      validateDownloadedBytes(dbBytes, metadata);
      // Bind bytes to the metadata version even when Graph supplied a separate download URL.
      if (graphClient.getFileMetadata !== undefined) {
        const latest = await graphClient.getFileMetadata(binding, signal);
        if (latest.eTag !== metadata.eTag || latest.sizeBytes !== metadata.sizeBytes)
          throw new SnapshotVersionError();
      }
      await measurePhase('validate', () => snapshotValidator.validate(dbBytes, signal));

      const snapshot: CachedDatabaseSnapshot = {
        binding,
        metadata: {
          eTag: metadata.eTag,
          lastSyncAtIso: now().toISOString(),
        },
        dbBytes,
      };

      signal?.throwIfAborted();
      try {
        await measurePhase('cache-write', () => cacheStore.writeSnapshot(snapshot));
      } catch (error) {
        throw new SnapshotCacheError(error);
      }

      return snapshot;
    },
  };
};
