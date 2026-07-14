// Refreshes the OneDrive DB after upload conflicts and replaces the stale in-memory SQLite runtime.
import { get, type Readable } from 'svelte/store';
import type { CacheStore } from '@cache';
import type { BrowserDbRuntime } from '@db';
import type { DriveItemBinding, GraphClient } from '@graph';
import { appSelectedDriveItemBindingStore, appSyncStateStore, type SyncStateStore } from '@shared';

import {
  createCachedDatabaseSnapshotService,
  type CachedDatabaseSnapshotValidator,
} from './cachedDatabaseSnapshotService';
import { resolveAppCacheStore } from './cacheStoreResolver';
import { resolveAppDbRuntime } from './dbRuntimeResolver';
import { resolveAppGraphClient } from './graphClientResolver';
import { resolveAppSnapshotValidator } from './snapshotValidatorResolver';

export interface DatabaseConflictRecoveryProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
}

export interface DatabaseConflictRecoveryOptions {
  readonly onProgress?: (progress: DatabaseConflictRecoveryProgress) => void;
}

export interface DatabaseConflictRecoveryService {
  discardStaleRuntime(): void;
  syncLatestDatabase(options?: DatabaseConflictRecoveryOptions): Promise<void>;
}

export interface CreateDatabaseConflictRecoveryServiceOptions {
  readonly now?: () => Date;
  readonly downloadingMessage?: string;
  readonly recoveredMessage?: string;
  readonly failureMessage?: string;
  readonly missingBindingMessage?: string;
  readonly snapshotValidator?: CachedDatabaseSnapshotValidator;
}

type BindingProvider = Readable<DriveItemBinding | null> | (() => DriveItemBinding | null);

const DEFAULT_CONFLICT_RECOVERY_BRANCH = 'conflict_recovery';
const DEFAULT_CONFLICT_RECOVERY_FAILED_BRANCH = 'conflict_recovery_failed';

const resolveBinding = (provider: BindingProvider): DriveItemBinding | null =>
  typeof provider === 'function' ? provider() : get(provider);

const toErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
};

export const createDatabaseConflictRecoveryService = (
  graphClient: Pick<GraphClient, 'getFileMetadata' | 'getFileDownloadUrl' | 'downloadFile'>,
  cacheStore: Pick<CacheStore, 'writeSnapshot'>,
  bindingProvider: BindingProvider,
  dbRuntime: Pick<BrowserDbRuntime, 'close' | 'open'>,
  syncStateStore: SyncStateStore = appSyncStateStore,
  options: CreateDatabaseConflictRecoveryServiceOptions = {},
): DatabaseConflictRecoveryService => {
  const now = options.now ?? (() => new Date());
  const downloadingMessage =
    options.downloadingMessage ?? 'Downloading the latest database from OneDrive...';
  const recoveredMessage =
    options.recoveredMessage ?? 'Latest database downloaded. Review the transfer and save again.';
  const failureMessage =
    options.failureMessage ??
    'Could not download the latest database from OneDrive. Check your connection and try again.';
  const missingBindingMessage =
    options.missingBindingMessage ?? 'Cannot refresh because no OneDrive database is selected.';
  const snapshotService = createCachedDatabaseSnapshotService(graphClient, cacheStore, {
    now,
    ...(options.snapshotValidator === undefined
      ? {}
      : { snapshotValidator: options.snapshotValidator }),
  });

  const setRecoveryError = (message: string): void => {
    syncStateStore.setError(message, { branch: DEFAULT_CONFLICT_RECOVERY_FAILED_BRANCH });
  };

  return {
    discardStaleRuntime(): void {
      dbRuntime.close();
    },

    async syncLatestDatabase(recoveryOptions?: DatabaseConflictRecoveryOptions): Promise<void> {
      const binding = resolveBinding(bindingProvider);

      if (binding === null) {
        dbRuntime.close();
        setRecoveryError(missingBindingMessage);
        throw new Error(missingBindingMessage);
      }

      syncStateStore.setSyncing(downloadingMessage, { branch: DEFAULT_CONFLICT_RECOVERY_BRANCH });
      dbRuntime.close();

      try {
        const metadata = await graphClient.getFileMetadata(binding);
        const snapshot = await snapshotService.downloadAndCacheSnapshot(
          binding,
          metadata,
          (loadedBytes, totalBytes) => {
            syncStateStore.updateProgress(loadedBytes, totalBytes, 'download');
            recoveryOptions?.onProgress?.({ loadedBytes, totalBytes });
          },
        );

        dbRuntime.close();
        await dbRuntime.open(snapshot.dbBytes);
        syncStateStore.setSynced(recoveredMessage, { branch: DEFAULT_CONFLICT_RECOVERY_BRANCH });
      } catch (error) {
        dbRuntime.close();
        const message = toErrorMessage(error, failureMessage);
        setRecoveryError(message);
        throw error instanceof Error ? error : new Error(message);
      }
    },
  };
};

export const createAppDatabaseConflictRecoveryService = (): DatabaseConflictRecoveryService =>
  createDatabaseConflictRecoveryService(
    resolveAppGraphClient(),
    resolveAppCacheStore(),
    appSelectedDriveItemBindingStore,
    resolveAppDbRuntime(),
    appSyncStateStore,
    { snapshotValidator: resolveAppSnapshotValidator() },
  );
