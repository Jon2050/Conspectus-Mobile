import { measurePhase, withRequestDeadline } from '@shared';
import { isDbRuntimeError } from '@db';
import { SnapshotCacheError, SnapshotVersionError } from './cachedDatabaseSnapshotService';
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
  | 'online_file_missing'
  | 'cache_unavailable'
  | 'database_invalid'
  | 'database_changed'
  | 'permission_denied';

export type StartupFreshnessFailureCode =
  | 'offline_unsupported'
  | 'metadata_fetch_failed'
  | 'snapshot_download_failed'
  | 'auth_expired'
  | 'file_not_found'
  | 'cache_unavailable'
  | 'database_invalid'
  | 'database_changed'
  | 'permission_denied';

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
  readonly reuseRuntime?: boolean;
}

export interface StartupFreshnessErrorDecision extends StartupFreshnessBaseDecision {
  readonly kind: 'error';
  readonly branch:
    | 'offline_unsupported'
    | 'online_metadata_failed'
    | 'online_download_failed'
    | 'online_auth_expired'
    | 'online_file_missing'
    | 'cache_unavailable'
    | 'database_invalid'
    | 'database_changed'
    | 'permission_denied';
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
    context?: FreshnessContext,
  ): Promise<StartupFreshnessDecision>;
}

export interface FreshnessContext {
  readonly signal?: AbortSignal;
  readonly activeSnapshot?: Omit<CachedDatabaseSnapshot, 'dbBytes'>;
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
  readonly validateCachedSnapshot?: (bytes: Uint8Array, signal?: AbortSignal) => Promise<void>;
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
  signal?: AbortSignal,
): Promise<Result> => {
  for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt += 1) {
    try {
      signal?.throwIfAborted();
      return await operation();
    } catch (error) {
      signal?.throwIfAborted();
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

      const delay = Math.max(calculateRetryDelayMs(attempt, retryOptions), error.retryAfterMs ?? 0);
      await withRequestDeadline(async () => retryOptions.waitFor(delay), delay + 1_000, signal);
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
  cacheStore: Pick<CacheStore, 'readSnapshot'> &
    Partial<Pick<CacheStore, 'readMetadata' | 'clearSnapshot'>>,
  snapshotService: Pick<CachedDatabaseSnapshotService, 'downloadAndCacheSnapshot'>,
  options: CreateStartupFreshnessServiceOptions = {},
): StartupFreshnessService => ({
  async resolve(
    binding: DriveItemBinding | null,
    isOnline: boolean,
    onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    mode: StartupFreshnessMode = 'reuse_if_current',
    context: FreshnessContext = {},
  ): Promise<StartupFreshnessDecision> {
    const signal = context.signal;
    signal?.throwIfAborted();
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
          async () =>
            measurePhase('metadata', () => graphClient.getFileMetadata(effectiveBinding, signal)),
          retryOptions,
          signal,
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
            async () => missingFileRecovery.recover(binding, signal),
            retryOptions,
            signal,
          );
          recoveredBinding = effectiveBinding;
          metadata = await executeWithRetry(
            'refresh the recovered OneDrive database metadata',
            async () =>
              measurePhase('metadata', () => graphClient.getFileMetadata(effectiveBinding, signal)),
            retryOptions,
            signal,
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

      let cachedSnapshot: CachedDatabaseSnapshot | null = null;
      if (mode === 'reuse_if_current') {
        const active = context.activeSnapshot;
        if (
          active !== undefined &&
          active.binding.driveId === effectiveBinding.driveId &&
          active.binding.itemId === effectiveBinding.itemId &&
          active.metadata.eTag === metadata.eTag
        ) {
          return {
            kind: 'ready',
            branch: 'online_unchanged',
            syncState: 'synced',
            snapshot: { ...active, dbBytes: new Uint8Array() },
            reuseRuntime: true,
            failure: null,
          };
        }
        try {
          const cachedMetadata = await cacheStore.readMetadata?.(effectiveBinding);
          if (cachedMetadata === undefined || cachedMetadata?.eTag === metadata.eTag) {
            cachedSnapshot = await measurePhase('cache-read', () =>
              cacheStore.readSnapshot(effectiveBinding),
            );
          }
          if (cachedSnapshot !== null && cachedSnapshot.metadata.eTag === metadata.eTag) {
            try {
              await options.validateCachedSnapshot?.(cachedSnapshot.dbBytes, signal);
            } catch {
              signal?.throwIfAborted();
              await cacheStore.clearSnapshot?.(effectiveBinding);
              cachedSnapshot = null;
            }
          }
        } catch {
          // A targeted fresh download may repair a damaged entry. Cache writes still fail closed.
          cachedSnapshot = null;
        }
        signal?.throwIfAborted();
      }
      if (cachedSnapshot !== null && cachedSnapshot.metadata.eTag === metadata.eTag) {
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
            snapshotService.downloadAndCacheSnapshot(
              effectiveBinding,
              metadata,
              onProgress,
              signal,
            ),
          retryOptions,
          signal,
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
        signal?.throwIfAborted();
        const special =
          error instanceof SnapshotCacheError
            ? 'cache_unavailable'
            : isDbRuntimeError(error)
              ? 'database_invalid'
              : error instanceof SnapshotVersionError
                ? 'database_changed'
                : null;
        if (special !== null)
          return {
            kind: 'error',
            branch: special,
            syncState: 'error',
            snapshot: null,
            failure: createFailure(special, error, 'Unable to prepare the database.'),
          };
        if (isGraphError(error) && error.code === 'forbidden')
          return {
            kind: 'error',
            branch: 'permission_denied',
            syncState: 'error',
            snapshot: null,
            failure: createFailure('permission_denied', error, 'Access denied.'),
          };
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
      signal?.throwIfAborted();
      if (isGraphError(error) && error.code === 'forbidden')
        return {
          kind: 'error',
          branch: 'permission_denied',
          syncState: 'error',
          snapshot: null,
          failure: createFailure('permission_denied', error, 'Access denied.'),
        };
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
