// Decides whether startup should use the cached DB snapshot, download a fresh one, or fail deterministically.
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient, GraphError } from '@graph';
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

export interface StartupFreshnessRetryOptions {
  readonly maxAttempts?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly waitFor?: (delayMs: number) => Promise<void>;
}

export interface CreateStartupFreshnessServiceOptions {
  readonly retry?: StartupFreshnessRetryOptions;
}

interface NormalizedStartupFreshnessRetryOptions {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly waitFor: (delayMs: number) => Promise<void>;
}

const DEFAULT_RETRY_OPTIONS: NormalizedStartupFreshnessRetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 250,
  maxDelayMs: 1_000,
  waitFor: async (delayMs) => {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
  },
};

const resolveErrorMessage = (error: unknown, fallbackMessage: string): string => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return fallbackMessage;
};

class StartupTransientRetryExhaustedError extends Error implements GraphError {
  readonly code: GraphError['code'] = 'network_error';
  readonly attempts: number;
  readonly status?: number;
  override readonly cause: unknown;

  constructor(message: string, attempts: number, cause: unknown) {
    super(message);
    this.name = 'StartupTransientRetryExhaustedError';
    this.attempts = attempts;
    this.cause = cause;
    if (isGraphError(cause) && cause.status !== undefined) {
      this.status = cause.status;
    }
  }
}

const normalizeRetryNumber = (value: number | undefined, fallbackValue: number): number => {
  if (value === undefined || !Number.isFinite(value)) {
    return fallbackValue;
  }

  return Math.max(1, Math.trunc(value));
};

const normalizeRetryOptions = (
  options: StartupFreshnessRetryOptions | undefined,
): NormalizedStartupFreshnessRetryOptions => {
  const maxAttempts = normalizeRetryNumber(options?.maxAttempts, DEFAULT_RETRY_OPTIONS.maxAttempts);
  const initialDelayMs = normalizeRetryNumber(
    options?.initialDelayMs,
    DEFAULT_RETRY_OPTIONS.initialDelayMs,
  );
  const maxDelayMs = Math.max(
    initialDelayMs,
    normalizeRetryNumber(options?.maxDelayMs, DEFAULT_RETRY_OPTIONS.maxDelayMs),
  );

  return {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    waitFor: options?.waitFor ?? DEFAULT_RETRY_OPTIONS.waitFor,
  };
};

const isGraphError = (error: unknown): error is GraphError => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const graphError = error as Partial<GraphError>;
  return typeof graphError.code === 'string' && typeof graphError.message === 'string';
};

const isRetryableStartupSyncError = (error: unknown): error is GraphError =>
  isGraphError(error) && error.code === 'network_error';

const buildRetryExhaustedMessage = (operationDescription: string, attempts: number): string =>
  `Unable to ${operationDescription} after ${attempts} attempts because OneDrive or the network remained unavailable. Check your connection and try again.`;

const calculateRetryDelayMs = (
  attemptNumber: number,
  retryOptions: NormalizedStartupFreshnessRetryOptions,
): number =>
  Math.min(
    retryOptions.initialDelayMs * 2 ** Math.max(0, attemptNumber - 1),
    retryOptions.maxDelayMs,
  );

const executeWithRetry = async <Result>(
  operationDescription: string,
  operation: () => Promise<Result>,
  retryOptions: NormalizedStartupFreshnessRetryOptions,
): Promise<Result> => {
  for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableStartupSyncError(error)) {
        throw error;
      }

      if (attempt >= retryOptions.maxAttempts) {
        throw new StartupTransientRetryExhaustedError(
          buildRetryExhaustedMessage(operationDescription, attempt),
          attempt,
          error,
        );
      }

      await retryOptions.waitFor(calculateRetryDelayMs(attempt, retryOptions));
    }
  }

  throw new Error('Startup sync retry loop completed without returning a result.');
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
  options: CreateStartupFreshnessServiceOptions = {},
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
      const retryOptions = normalizeRetryOptions(options.retry);
      const metadata = await executeWithRetry(
        'refresh the selected OneDrive database metadata',
        async () => graphClient.getFileMetadata(binding),
        retryOptions,
      );

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
        const downloadedSnapshot = await executeWithRetry(
          'download the latest OneDrive database snapshot',
          async () => snapshotService.downloadAndCacheSnapshot(binding, metadata),
          retryOptions,
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
