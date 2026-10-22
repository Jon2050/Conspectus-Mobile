// Uploads exported SQLite snapshots to OneDrive and refreshes local cache metadata.
import { get, type Readable } from 'svelte/store';
import type { CacheStore } from '@cache';
import type { DriveItemBinding, GraphClient } from '@graph';
import {
  appSelectedDriveItemBindingStore,
  appSyncStateStore,
  withRequestDeadline,
  type SyncStateStore,
} from '@shared';

import { appDatabaseSession, type DatabaseSession, sameDatabaseIdentity } from './databaseSession';
import { resolveAppCacheStore } from './cacheStoreResolver';
import { resolveAppGraphClient } from './graphClientResolver';
import type { DatabaseUploadHandoff, DatabaseUploadOptions } from './transferSaveExportService';

export type DatabaseUploadErrorCode =
  | 'missing_binding'
  | 'missing_cached_snapshot'
  | 'conflict'
  | 'upload_failed'
  | 'context_changed'
  | 'remote_outcome_unknown'
  | 'remote_commit_cache_failed';

export class DatabaseUploadError extends Error {
  readonly code: DatabaseUploadErrorCode;
  readonly cause?: unknown;
  readonly expectedETag: string | null;

  constructor(
    code: DatabaseUploadErrorCode,
    message: string,
    cause?: unknown,
    expectedETag: string | null = null,
  ) {
    super(message);
    this.name = 'DatabaseUploadError';
    this.code = code;
    this.expectedETag = expectedETag;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface CreateDatabaseUploadHandoffServiceOptions {
  readonly now?: () => Date;
  readonly session?: DatabaseSession;
  readonly uploadingMessage?: string;
  readonly uploadedMessage?: string;
  readonly conflictMessage?: string;
  readonly failureMessage?: string;
}

type BindingProvider = Readable<DriveItemBinding | null> | (() => DriveItemBinding | null);

const DEFAULT_UPLOAD_PROGRESS_BRANCH = 'uploading_database';
const DEFAULT_UPLOAD_CONFLICT_BRANCH = 'upload_conflict';
const DEFAULT_UPLOAD_FAILED_BRANCH = 'upload_failed';
const DEFAULT_UPLOAD_CACHE_RECOVERY_BRANCH = 'upload_cache_recovery_required';

const resolveBinding = (provider: BindingProvider): DriveItemBinding | null =>
  typeof provider === 'function' ? provider() : get(provider);

const isGraphConflict = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'conflict';

const toUploadError = (
  error: unknown,
  conflictMessage: string,
  failureMessage: string,
  expectedETag: string | null,
  uploadWasInvoked: boolean,
): Error => {
  if (error instanceof DatabaseUploadError) {
    return error;
  }

  if (isGraphConflict(error)) {
    return new DatabaseUploadError('conflict', conflictMessage, error, expectedETag);
  }

  const status =
    typeof error === 'object' && error !== null ? (error as { status?: number }).status : undefined;
  const graphCode =
    typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
  const code =
    !uploadWasInvoked || graphCode === 'unauthorized' || graphCode === 'forbidden'
      ? 'upload_failed'
      : status !== undefined && status >= 200 && status < 300
        ? 'remote_commit_cache_failed'
        : status === undefined || status >= 500
          ? 'remote_outcome_unknown'
          : 'upload_failed';
  return new DatabaseUploadError(code, failureMessage, error, expectedETag);
};

export const createDatabaseUploadHandoffService = (
  graphClient: Pick<GraphClient, 'uploadFile'> &
    Partial<Pick<GraphClient, 'getFileMetadata' | 'getFileDownloadUrl' | 'downloadFile'>>,
  cacheStore: Pick<CacheStore, 'readSnapshot' | 'writeSnapshot'> & Pick<CacheStore, 'readMetadata'>,
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
      const context = uploadOptions?.context;
      const assertContext = (): void => {
        if (options.session !== undefined && context === undefined) {
          throw new DatabaseUploadError(
            'context_changed',
            'An immutable upload context is required.',
          );
        }
        if (context !== undefined) {
          try {
            options.session?.assert(context);
          } catch (error) {
            throw new DatabaseUploadError(
              'context_changed',
              'The database session changed.',
              error,
            );
          }
          const selected = resolveBinding(bindingProvider);
          if (
            selected === null ||
            !sameDatabaseIdentity(context, { accountId: context.accountId, binding: selected })
          ) {
            throw new DatabaseUploadError('context_changed', 'The upload target changed.');
          }
        }
      };
      const contextIsCurrent = (): boolean => {
        try {
          assertContext();
          return true;
        } catch {
          return false;
        }
      };
      assertContext();
      const binding = context?.binding ?? resolveBinding(bindingProvider);

      if (binding === null) {
        const error = new DatabaseUploadError(
          'missing_binding',
          'Cannot upload the database because no OneDrive file is selected.',
        );
        syncStateStore.setError(error.message, { branch: DEFAULT_UPLOAD_FAILED_BRANCH });
        throw error;
      }

      syncStateStore.setSyncing(uploadingMessage, { branch: DEFAULT_UPLOAD_PROGRESS_BRANCH });

      let uploadWasInvoked = false;
      let uploadResult: Awaited<ReturnType<GraphClient['uploadFile']>>;
      let expectedETag = context?.baseETag ?? uploadOptions?.expectedETag ?? null;

      // A lost acknowledgement is not a failed commit. Prove the exact snapshot is current
      // before treating it as saved; never issue another PUT or replay SQL during this check.
      const confirmUnknownUpload = async (): Promise<typeof uploadResult | null> => {
        const { getFileMetadata, getFileDownloadUrl, downloadFile } = graphClient;
        if (!getFileMetadata || !downloadFile) return null;
        try {
          return await withRequestDeadline(async (signal) => {
            assertContext();
            const metadata = await getFileMetadata(binding, signal);
            assertContext();
            if (metadata.eTag === expectedETag || metadata.sizeBytes !== dbBytes.length)
              return null;
            const url = metadata.downloadUrl ?? (await getFileDownloadUrl?.(binding, signal));
            assertContext();
            if (!url) return null;
            const remoteBytes = await downloadFile(url, undefined, signal);
            assertContext();
            if (
              remoteBytes.length !== dbBytes.length ||
              !remoteBytes.every((byte, index) => byte === dbBytes[index])
            )
              return null;
            const verified = await getFileMetadata(binding, signal);
            assertContext();
            return verified.eTag === metadata.eTag && verified.sizeBytes === dbBytes.length
              ? verified
              : null;
          }, 30_000);
        } catch {
          return null;
        }
      };

      try {
        const currentMetadata =
          cacheStore.readMetadata !== undefined
            ? await cacheStore.readMetadata(binding)
            : ((await cacheStore.readSnapshot(binding))?.metadata ?? null);
        if (currentMetadata === null) {
          throw new DatabaseUploadError(
            'missing_cached_snapshot',
            'Cannot upload the database because no cached OneDrive metadata is available.',
          );
        }

        if (expectedETag !== null && currentMetadata.eTag !== expectedETag) {
          throw new DatabaseUploadError('conflict', conflictMessage, undefined, expectedETag);
        }

        expectedETag ??= currentMetadata.eTag;
        assertContext();

        uploadWasInvoked = true;
        uploadResult = await graphClient.uploadFile(
          binding,
          dbBytes,
          expectedETag,
          (loadedBytes, totalBytes) => {
            if (!contextIsCurrent()) return;
            syncStateStore.updateProgress(loadedBytes, totalBytes, 'upload');
            uploadOptions?.onProgress?.({ loadedBytes, totalBytes });
          },
          ...(context === undefined ? [] : [assertContext]),
        );
      } catch (error) {
        const uploadError = toUploadError(
          error,
          conflictMessage,
          failureMessage,
          expectedETag,
          uploadWasInvoked,
        );

        const confirmed =
          uploadError instanceof DatabaseUploadError &&
          uploadError.code === 'remote_outcome_unknown' &&
          contextIsCurrent()
            ? await confirmUnknownUpload()
            : null;
        if (confirmed !== null) {
          uploadResult = confirmed;
        } else {
          if (!contextIsCurrent()) throw uploadError;
          if (
            uploadError instanceof DatabaseUploadError &&
            uploadError.code === 'missing_cached_snapshot'
          ) {
            syncStateStore.setError(uploadError.message, { branch: DEFAULT_UPLOAD_FAILED_BRANCH });
          } else if (
            uploadError instanceof DatabaseUploadError &&
            uploadError.code === 'remote_commit_cache_failed'
          ) {
            syncStateStore.setStale(uploadError.message, {
              branch: DEFAULT_UPLOAD_CACHE_RECOVERY_BRANCH,
            });
          } else if (
            uploadError instanceof DatabaseUploadError &&
            uploadError.code === 'conflict'
          ) {
            syncStateStore.setStale(uploadError.message, {
              branch: DEFAULT_UPLOAD_CONFLICT_BRANCH,
            });
          } else {
            syncStateStore.setError(uploadError.message, { branch: DEFAULT_UPLOAD_FAILED_BRANCH });
          }

          throw uploadError;
        }
      }

      try {
        assertContext();
        await cacheStore.writeSnapshot({
          binding,
          metadata: {
            eTag: uploadResult.eTag,
            lastSyncAtIso: now().toISOString(),
          },
          dbBytes,
        });

        assertContext();
        if (context !== undefined) options.session?.accept(context, uploadResult.eTag);
        syncStateStore.setSynced(uploadedMessage, { branch: DEFAULT_UPLOAD_PROGRESS_BRANCH });
      } catch (error) {
        const cacheError = new DatabaseUploadError(
          'remote_commit_cache_failed',
          'The transfer was saved to OneDrive, but the local database cache could not be refreshed.',
          error,
        );
        if (contextIsCurrent())
          syncStateStore.setStale(cacheError.message, {
            branch: DEFAULT_UPLOAD_CACHE_RECOVERY_BRANCH,
          });
        throw cacheError;
      }
    },
  };
};

export const createAppDatabaseUploadHandoffService = (): DatabaseUploadHandoff =>
  createDatabaseUploadHandoffService(
    resolveAppGraphClient(),
    resolveAppCacheStore(),
    appSelectedDriveItemBindingStore,
    appSyncStateStore,
    { session: appDatabaseSession },
  );
