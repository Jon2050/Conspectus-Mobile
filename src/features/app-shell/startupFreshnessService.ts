// Decides whether startup should use the cached DB snapshot, download a fresh one, or fail deterministically.
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient } from '@graph';
import type { SyncState } from '@shared';

import type { CachedDatabaseSnapshotService } from './cachedDatabaseSnapshotService';

export type StartupFreshnessBranch =
  | 'no_binding'
  | 'online_unchanged'
  | 'online_changed'
  | 'offline_cached'
  | 'offline_missing_cache'
  | 'online_metadata_failed_cached'
  | 'online_metadata_failed'
  | 'online_download_failed_cached'
  | 'online_download_failed';

export type StartupFreshnessFailureCode =
  | 'offline_cache_missing'
  | 'metadata_fetch_failed'
  | 'snapshot_download_failed';

export interface StartupFreshnessFailure {
  readonly code: StartupFreshnessFailureCode;
  readonly message: string;
  readonly cause: unknown;
}

interface StartupFreshnessBaseDecision {
  readonly branch: StartupFreshnessBranch;
  readonly syncState: SyncState;
  readonly failure: StartupFreshnessFailure | null;
}

export interface StartupFreshnessSkippedDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'skipped';
  readonly branch: 'no_binding';
  readonly syncState: 'idle';
  readonly snapshot: null;
}

export interface StartupFreshnessReadyDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'ready';
  readonly branch:
    | 'online_unchanged'
    | 'online_changed'
    | 'offline_cached'
    | 'online_metadata_failed_cached'
    | 'online_download_failed_cached';
  readonly syncState: 'synced' | 'offline' | 'stale';
  readonly snapshot: CachedDatabaseSnapshot;
}

export interface StartupFreshnessErrorDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'error';
  readonly branch: 'offline_missing_cache' | 'online_metadata_failed' | 'online_download_failed';
  readonly syncState: 'error';
  readonly snapshot: null;
  readonly failure: StartupFreshnessFailure;
}

export type StartupFreshnessDecision =
  | StartupFreshnessSkippedDecision
  | StartupFreshnessReadyDecision
  | StartupFreshnessErrorDecision;

export interface StartupFreshnessService {
  resolve(binding: DriveItemBinding | null, isOnline: boolean): Promise<StartupFreshnessDecision>;
}

const resolveErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return fallbackMessage;
};

const createFailure = (
  code: StartupFreshnessFailureCode,
  error: unknown,
  fallbackMessage: string,
): StartupFreshnessFailure => ({
  code,
  message: resolveErrorMessage(error, fallbackMessage),
  cause: error,
});

export const createStartupFreshnessService = (
  graphClient: Pick<GraphClient, 'getFileMetadata'>,
  cacheStore: Pick<CacheStore, 'readSnapshot'>,
  snapshotService: Pick<CachedDatabaseSnapshotService, 'downloadAndCacheSnapshot'>,
): StartupFreshnessService => ({
  async resolve(
    binding: DriveItemBinding | null,
    isOnline: boolean,
  ): Promise<StartupFreshnessDecision> {
    if (binding === null) {
      return {
        kind: 'skipped',
        branch: 'no_binding',
        syncState: 'idle',
        snapshot: null,
        failure: null,
      };
    }

    const cachedSnapshot = await cacheStore.readSnapshot(binding);

    if (!isOnline) {
      if (cachedSnapshot !== null) {
        return {
          kind: 'ready',
          branch: 'offline_cached',
          syncState: 'offline',
          snapshot: cachedSnapshot,
          failure: null,
        };
      }

      return {
        kind: 'error',
        branch: 'offline_missing_cache',
        syncState: 'error',
        snapshot: null,
        failure: createFailure(
          'offline_cache_missing',
          new Error('No cached OneDrive database is available while offline.'),
          'No cached OneDrive database is available while offline.',
        ),
      };
    }

    try {
      const metadata = await graphClient.getFileMetadata(binding);

      if (cachedSnapshot !== null && cachedSnapshot.metadata.eTag === metadata.eTag) {
        return {
          kind: 'ready',
          branch: 'online_unchanged',
          syncState: 'synced',
          snapshot: cachedSnapshot,
          failure: null,
        };
      }

      try {
        const downloadedSnapshot = await snapshotService.downloadAndCacheSnapshot(
          binding,
          metadata,
        );

        return {
          kind: 'ready',
          branch: 'online_changed',
          syncState: 'synced',
          snapshot: downloadedSnapshot,
          failure: null,
        };
      } catch (error) {
        const failure = createFailure(
          'snapshot_download_failed',
          error,
          'Failed to download the latest OneDrive database snapshot.',
        );

        if (cachedSnapshot !== null) {
          return {
            kind: 'ready',
            branch: 'online_download_failed_cached',
            syncState: 'stale',
            snapshot: cachedSnapshot,
            failure,
          };
        }

        return {
          kind: 'error',
          branch: 'online_download_failed',
          syncState: 'error',
          snapshot: null,
          failure,
        };
      }
    } catch (error) {
      const failure = createFailure(
        'metadata_fetch_failed',
        error,
        'Failed to refresh the selected OneDrive database metadata.',
      );

      if (cachedSnapshot !== null) {
        return {
          kind: 'ready',
          branch: 'online_metadata_failed_cached',
          syncState: 'stale',
          snapshot: cachedSnapshot,
          failure,
        };
      }

      return {
        kind: 'error',
        branch: 'online_metadata_failed',
        syncState: 'error',
        snapshot: null,
        failure,
      };
    }
  },
});
