// Decides whether startup should use the cached DB snapshot, download a fresh one, or fail deterministically.
import type { CacheStore, CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient, GraphError, GraphFileMetadata } from '@graph';
import type { SyncState } from '@shared';

import type { CachedDatabaseSnapshotService } from './cachedDatabaseSnapshotService';
import {
  isMissingFileRecoveryError,
  type MissingFileRecoveryService,
} from './missingFileRecoveryService';

export type StartupFreshnessBranch =
  | 'no_binding'
  | 'online_unchanged'
  | 'online_changed'
  | 'offline_unsupported'
  | 'online_metadata_failed'
  | 'online_download_failed'
  | 'online_auth_expired'
  | 'online_file_missing';

export type StartupFreshnessFailureCode =
  | 'offline_unsupported'
  | 'metadata_fetch_failed'
  | 'snapshot_download_failed'
  | 'auth_expired'
  | 'file_not_found';

export type StartupFreshnessMode = 'reuse_if_current' | 'force_download';

export interface StartupFreshnessFailure {
  readonly code: StartupFreshnessFailureCode;
  readonly message: string;
  readonly cause: unknown;
}

interface StartupFreshnessBaseDecision {
  readonly branch: StartupFreshnessBranch;
  readonly syncState: SyncState;
  readonly failure: StartupFreshnessFailure | null;
  readonly recoveredBinding?: DriveItemBinding;
}

export interface StartupFreshnessSkippedDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'skipped';
  readonly branch: 'no_binding';
  readonly syncState: 'idle';
  readonly snapshot: null;
}

export interface StartupFreshnessReadyDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'ready';
  readonly branch: 'online_unchanged' | 'online_changed';
  readonly syncState: 'synced';
  readonly snapshot: CachedDatabaseSnapshot;
}

export interface StartupFreshnessErrorDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'error';
  readonly branch:
    | 'offline_unsupported'
    | 'online_metadata_failed'
    | 'online_download_failed'
    | 'online_auth_expired'
    | 'online_file_missing';
  readonly syncState: 'error';
  readonly snapshot: null;
  readonly failure: StartupFreshnessFailure;
}

export type StartupFreshnessDecision =
  | StartupFreshnessSkippedDecision
  | StartupFreshnessReadyDecision
  | StartupFreshnessErrorDecision;

export interface StartupFreshnessService {
  /** Resolves online freshness; force_download bypasses unchanged-eTag cache reuse. */
  resolve(
    binding: DriveItemBinding | null,
    isOnline: boolean,
    onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    mode?: StartupFreshnessMode,
  ): Promise<StartupFreshnessDecision>;
}

export interface StartupFreshnessRetryOptions {
  readonly maxAttempts?: number;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly waitFor?: (delayMs: number) => Promise<void>;
}

export interface CreateStartupFreshnessServiceOptions {
  readonly retry?: StartupFreshnessRetryOptions;
  readonly missingFileRecovery?: Pick<MissingFileRecoveryService, 'recover'>;
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
    onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    mode: StartupFreshnessMode = 'reuse_if_current',
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

    if (!isOnline) {
      return {
        kind: 'error',
        branch: 'offline_unsupported',
        syncState: 'error',
        snapshot: null,
        failure: createFailure(
          'offline_unsupported',
          new Error('Connection is required to load the database.'),
          'Connection is required to load the database.',
        ),
      };
    }

    try {
      const retryOptions = normalizeRetryOptions(options.retry);
      const missingFileRecovery = options.missingFileRecovery;
      let effectiveBinding = binding;
      let recoveredBinding: DriveItemBinding | undefined;
      let metadata: GraphFileMetadata;

      try {
        metadata = await executeWithRetry(
          'refresh the selected OneDrive database metadata',
          async () => graphClient.getFileMetadata(effectiveBinding),
          retryOptions,
        );
      } catch (error) {
        if (
          missingFileRecovery === undefined ||
          !isGraphError(error) ||
          error.code !== 'not_found'
        ) {
          throw error;
        }

        try {
          effectiveBinding = await executeWithRetry(
            'resolve the selected OneDrive database at its saved path',
            async () => missingFileRecovery.recover(binding),
            retryOptions,
          );
          recoveredBinding = effectiveBinding;
          metadata = await executeWithRetry(
            'refresh the recovered OneDrive database metadata',
            async () => graphClient.getFileMetadata(effectiveBinding),
            retryOptions,
          );
        } catch (recoveryError) {
          if (
            isMissingFileRecoveryError(recoveryError) ||
            (isGraphError(recoveryError) && recoveryError.code === 'not_found')
          ) {
            return {
              kind: 'error',
              branch: 'online_file_missing',
              syncState: 'error',
              snapshot: null,
              failure: createFailure(
                'file_not_found',
                recoveryError,
                'The selected OneDrive database no longer exists at its saved path.',
              ),
            };
          }

          throw recoveryError;
        }
      }

      const cachedSnapshot = await cacheStore.readSnapshot(effectiveBinding);

      if (
        mode === 'reuse_if_current' &&
        cachedSnapshot !== null &&
        cachedSnapshot.metadata.eTag === metadata.eTag
      ) {
        return {
          kind: 'ready',
          branch: 'online_unchanged',
          syncState: 'synced',
          snapshot: cachedSnapshot,
          failure: null,
          ...(recoveredBinding === undefined ? {} : { recoveredBinding }),
        };
      }

      try {
        const downloadedSnapshot = await executeWithRetry(
          'download the latest OneDrive database snapshot',
          async () =>
            snapshotService.downloadAndCacheSnapshot(effectiveBinding, metadata, onProgress),
          retryOptions,
        );

        return {
          kind: 'ready',
          branch: 'online_changed',
          syncState: 'synced',
          snapshot: downloadedSnapshot,
          failure: null,
          ...(recoveredBinding === undefined ? {} : { recoveredBinding }),
        };
      } catch (error) {
        const isAuthError = isGraphError(error) && error.code === 'unauthorized';
        const failureCode = isAuthError ? 'auth_expired' : 'snapshot_download_failed';
        const fallbackMessage = isAuthError
          ? 'Your session has expired. Please sign in again to sync with OneDrive.'
          : 'Failed to download the latest OneDrive database snapshot.';

        const failure = createFailure(failureCode, error, fallbackMessage);

        return {
          kind: 'error',
          branch: isAuthError ? 'online_auth_expired' : 'online_download_failed',
          syncState: 'error',
          snapshot: null,
          failure,
        };
      }
    } catch (error) {
      const isAuthError = isGraphError(error) && error.code === 'unauthorized';
      const failureCode = isAuthError ? 'auth_expired' : 'metadata_fetch_failed';
      const fallbackMessage = isAuthError
        ? 'Your session has expired. Please sign in again to sync with OneDrive.'
        : 'Failed to refresh the selected OneDrive database metadata.';

      const failure = createFailure(failureCode, error, fallbackMessage);

      return {
        kind: 'error',
        branch: isAuthError ? 'online_auth_expired' : 'online_metadata_failed',
        syncState: 'error',
        snapshot: null,
        failure,
      };
    }
  },
});
