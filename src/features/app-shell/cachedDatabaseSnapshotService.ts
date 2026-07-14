// Downloads a OneDrive SQLite DB snapshot, validates its integrity, and caches it for verified startup reuse.
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import {
  createBrowserDbRuntime,
  DbRuntimeError,
  hasSqliteHeader,
  type BrowserDbRuntime,
} from '@db';
import type { DriveItemBinding, GraphClient, GraphFileMetadata } from '@graph';

export interface CachedDatabaseSnapshotService {
  downloadAndCacheSnapshot(
    binding: DriveItemBinding,
    metadata: GraphFileMetadata,
    onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
  ): Promise<CachedDatabaseSnapshot>;
}

export interface CreateCachedDatabaseSnapshotServiceOptions {
  readonly now?: () => Date;
  readonly snapshotValidator?: CachedDatabaseSnapshotValidator;
}

export interface CachedDatabaseSnapshotValidator {
  validate(snapshotBytes: Uint8Array): Promise<void>;
}

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

  if (!hasSqliteHeader(bytes)) {
    throw new Error('The downloaded OneDrive database payload is not a valid SQLite file.');
  }
};

const REQUIRED_CONSPECTUS_TABLES = ['account', 'category', 'transfer'] as const;

const validateOpenedConspectusDatabase = (dbRuntime: Pick<BrowserDbRuntime, 'exec'>): void => {
  const integrityRows = dbRuntime.exec('PRAGMA integrity_check;')[0]?.values;
  const integrityValue = integrityRows?.[0]?.[0];

  if (integrityValue !== 'ok') {
    throw new DbRuntimeError(
      'db_open_failed',
      `The downloaded OneDrive database failed SQLite integrity validation: ${String(integrityValue)}.`,
    );
  }

  const tableRows =
    dbRuntime.exec(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('account', 'category', 'transfer')
        ORDER BY name ASC;
      `,
    )[0]?.values ?? [];
  const tableNames = new Set(
    tableRows.map((row) => row[0]).filter((value): value is string => typeof value === 'string'),
  );
  const missingTables = REQUIRED_CONSPECTUS_TABLES.filter(
    (tableName) => !tableNames.has(tableName),
  );

  if (missingTables.length > 0) {
    throw new DbRuntimeError(
      'db_open_failed',
      `The downloaded OneDrive database is missing required Conspectus table(s): ${missingTables.join(', ')}.`,
    );
  }
};

export const createSqliteSnapshotValidator = (
  dbRuntime: Pick<BrowserDbRuntime, 'open' | 'close' | 'exec'> = createBrowserDbRuntime(),
): CachedDatabaseSnapshotValidator => ({
  async validate(snapshotBytes: Uint8Array): Promise<void> {
    try {
      await dbRuntime.open(snapshotBytes);
      validateOpenedConspectusDatabase(dbRuntime);
    } catch (error) {
      if (error instanceof DbRuntimeError && error.code === 'db_open_failed') {
        throw error;
      }

      throw new DbRuntimeError(
        'db_open_failed',
        'The downloaded OneDrive database could not be validated as a usable Conspectus SQLite file.',
        { cause: error },
      );
    } finally {
      dbRuntime.close();
    }
  },
});

export const createCachedDatabaseSnapshotService = (
  graphClient: Pick<GraphClient, 'getFileDownloadUrl' | 'downloadFile'>,
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
    ): Promise<CachedDatabaseSnapshot> {
      const downloadUrl = await graphClient.getFileDownloadUrl(binding);
      const dbBytes = await graphClient.downloadFile(downloadUrl, onProgress);
      validateDownloadedBytes(dbBytes, metadata);
      await snapshotValidator.validate(dbBytes);

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
