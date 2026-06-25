// Uploads exported SQLite snapshots to OneDrive and refreshes local cache metadata.
import { get, type Readable } from 'svelte/store';
import type { CacheStore } from '@cache';
import type { DriveItemBinding, GraphClient } from '@graph';
import { appSelectedDriveItemBindingStore, appSyncStateStore, type SyncStateStore } from '@shared';

import { resolveAppCacheStore } from './cacheStoreResolver';
import { resolveAppGraphClient } from './graphClientResolver';
import type { DatabaseUploadHandoff, DatabaseUploadOptions } from './transferSaveExportService';

export type DatabaseUploadErrorCode =
  | 'missing_binding'
  | 'missing_cached_snapshot'
  | 'conflict'
  | 'upload_failed';

export class DatabaseUploadError extends Error {
  readonly code: DatabaseUploadErrorCode;
  readonly cause?: unknown;

  constructor(code: DatabaseUploadErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DatabaseUploadError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface CreateDatabaseUploadHandoffServiceOptions {
  readonly now?: () => Date;
  readonly uploadingMessage?: string;
  readonly uploadedMessage?: string;
  readonly conflictMessage?: string;
  readonly failureMessage?: string;
}

type BindingProvider = Readable<DriveItemBinding | null> | (() => DriveItemBinding | null);

const DEFAULT_UPLOAD_PROGRESS_BRANCH = 'uploading_database';
const DEFAULT_UPLOAD_CONFLICT_BRANCH = 'upload_conflict';
const DEFAULT_UPLOAD_FAILED_BRANCH = 'upload_failed';

const resolveBinding = (provider: BindingProvider): DriveItemBinding | null =>
  typeof provider === 'function' ? provider() : get(provider);

const isGraphConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'conflict';

const toUploadError = (error: unknown, conflictMessage: string, failureMessage: string): Error => {
  if (error instanceof DatabaseUploadError) {
    return error;
  }

  if (isGraphConflict(error)) {
    return new DatabaseUploadError('conflict', conflictMessage, error);
  }

  return new DatabaseUploadError('upload_failed', failureMessage, error);
};

export const createDatabaseUploadHandoffService = (
  graphClient: Pick<GraphClient, 'uploadFile'>,
  cacheStore: Pick<CacheStore, 'readSnapshot' | 'writeSnapshot'>,
  bindingProvider: BindingProvider,
  syncStateStore: SyncStateStore = appSyncStateStore,
  options: CreateDatabaseUploadHandoffServiceOptions = {},
): DatabaseUploadHandoff => {
  const now = options.now ?? (() => new Date());
  const uploadingMessage = options.uploadingMessage ?? 'Uploading database to OneDrive...';
  const uploadedMessage = options.uploadedMessage ?? 'Database uploaded to OneDrive.';
  const conflictMessage =
    options.conflictMessage ??
    'The OneDrive database changed before upload completed. Refresh before trying again.';
  const failureMessage =
    options.failureMessage ?? 'Uploading the database to OneDrive failed. Try again.';

  return {
    async uploadExportedDatabase(
      dbBytes: Uint8Array,
      uploadOptions?: DatabaseUploadOptions,
    ): Promise<void> {
      const binding = resolveBinding(bindingProvider);

      if (binding === null) {
        const error = new DatabaseUploadError(
          'missing_binding',
          'Cannot upload the database because no OneDrive file is selected.',
        );
        syncStateStore.setError(error.message, { branch: DEFAULT_UPLOAD_FAILED_BRANCH });
        throw error;
      }

      syncStateStore.setSyncing(uploadingMessage, { branch: DEFAULT_UPLOAD_PROGRESS_BRANCH });

      try {
        const currentSnapshot = await cacheStore.readSnapshot(binding);
        if (currentSnapshot === null) {
          throw new DatabaseUploadError(
            'missing_cached_snapshot',
            'Cannot upload the database because no cached OneDrive metadata is available.',
          );
        }

        const uploadResult = await graphClient.uploadFile(
          binding,
          dbBytes,
          currentSnapshot.metadata.eTag,
          (loadedBytes, totalBytes) => {
            syncStateStore.updateProgress(loadedBytes, totalBytes, 'upload');
            uploadOptions?.onProgress?.({ loadedBytes, totalBytes });
          },
        );

        await cacheStore.writeSnapshot({
          binding,
          metadata: {
            eTag: uploadResult.eTag,
            lastSyncAtIso: now().toISOString(),
          },
          dbBytes,
        });

        syncStateStore.setSynced(uploadedMessage, { branch: DEFAULT_UPLOAD_PROGRESS_BRANCH });
      } catch (error) {
        const uploadError = toUploadError(error, conflictMessage, failureMessage);

        if (
          uploadError instanceof DatabaseUploadError &&
          uploadError.code === 'missing_cached_snapshot'
        ) {
          syncStateStore.setError(uploadError.message, { branch: DEFAULT_UPLOAD_FAILED_BRANCH });
        } else if (uploadError instanceof DatabaseUploadError && uploadError.code === 'conflict') {
          syncStateStore.setStale(uploadError.message, { branch: DEFAULT_UPLOAD_CONFLICT_BRANCH });
        } else {
          syncStateStore.setError(uploadError.message, { branch: DEFAULT_UPLOAD_FAILED_BRANCH });
        }

        throw uploadError;
      }
    },
  };
};

export const createAppDatabaseUploadHandoffService = (): DatabaseUploadHandoff =>
  createDatabaseUploadHandoffService(
    resolveAppGraphClient(),
    resolveAppCacheStore(),
    appSelectedDriveItemBindingStore,
  );
