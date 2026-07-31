// Owns duplicate-safe receipt batch commit, upload retry, conflict recovery, and reconciliation.
import type { CreateTransferInput } from '@db';
import type { ToastStore } from '@shared';
import { appToastStore } from '@shared';

import {
  validatePreparedReceiptTransferCommands,
  type ReceiptTransferPreparationError,
} from '../receipt';
import type { AddTransferOptionsState } from './routes/addTransferOptionsController';
import { DatabaseUploadError } from './databaseUploadHandoffService';
import {
  createAppDatabaseConflictRecoveryService,
  type DatabaseConflictRecoveryProgress,
  type DatabaseConflictRecoveryService,
} from './databaseConflictRecoveryService';
import {
  createAppTransferSaveExportService,
  TransferBatchExportRecoveryRequiredError,
  TransferBatchUploadPendingError,
  type DatabaseUploadProgress,
  type TransferBatchSaveExportService,
} from './transferSaveExportService';

export type ReceiptTransferCommitPhase =
  | 'idle'
  | 'validating'
  | 'local_save'
  | 'uploading'
  | 'upload_failed'
  | 'local_commit_syncing'
  | 'local_commit_recovery_failed'
  | 'conflict'
  | 'conflict_syncing'
  | 'conflict_ready'
  | 'remote_commit_syncing'
  | 'remote_commit_recovery_failed'
  | 'saved'
  | 'failed'
  | 'invalidated';

export type ReceiptTransferCommitErrorCode =
  | 'offline'
  | 'context_unavailable'
  | 'context_changed'
  | 'validation_failed'
  | 'local_failed'
  | 'local_commit_recovery_failed'
  | 'upload_failed'
  | 'conflict'
  | 'conflict_sync_failed'
  | 'remote_commit_recovery_failed';

export interface ReceiptTransferCommitError {
  readonly code: ReceiptTransferCommitErrorCode;
  readonly detail: string | null;
  readonly preparationError: ReceiptTransferPreparationError | null;
}

export interface ReceiptTransferCommitState {
  readonly phase: ReceiptTransferCommitPhase;
  readonly createdCount: number;
  readonly error: ReceiptTransferCommitError | null;
  readonly progress: DatabaseUploadProgress | null;
  readonly recoveryProgress: DatabaseConflictRecoveryProgress | null;
}

export interface ReceiptTransferCommitContext {
  readonly isOnline: boolean;
  readonly isAuthenticated: boolean;
  readonly isVerifiedCurrent: boolean;
  readonly contextKey: string | null;
  readonly optionsState: AddTransferOptionsState;
}

export type ReceiptTransferCommitTranslator = (
  key: string,
  options?: { readonly values?: Record<string, string | number> },
) => string;

export interface ReceiptTransferCommitController {
  getState(): ReceiptTransferCommitState;
  subscribe(listener: (state: ReceiptTransferCommitState) => void): () => void;
  commit(
    commands: readonly CreateTransferInput[],
    context: ReceiptTransferCommitContext,
    t: ReceiptTransferCommitTranslator,
  ): Promise<void>;
  retryUpload(
    context: ReceiptTransferCommitContext,
    t: ReceiptTransferCommitTranslator,
  ): Promise<void>;
  resolveConflict(
    loadCurrentContext: () => Promise<ReceiptTransferCommitContext>,
    t: ReceiptTransferCommitTranslator,
  ): Promise<void>;
  retryAfterConflict(
    context: ReceiptTransferCommitContext,
    t: ReceiptTransferCommitTranslator,
  ): Promise<void>;
  retryLocalCommitRecovery(t: ReceiptTransferCommitTranslator): Promise<void>;
  invalidate(): void;
  reset(): void;
}

const INITIAL_STATE: ReceiptTransferCommitState = Object.freeze({
  phase: 'idle',
  createdCount: 0,
  error: null,
  progress: null,
  recoveryProgress: null,
});

const detailFrom = (error: unknown): string | null =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : null;

const contextError = (
  context: ReceiptTransferCommitContext,
  expectedContextKey: string | null,
  requireVerifiedCurrent: boolean,
): ReceiptTransferCommitError | null => {
  if (!context.isOnline) {
    return { code: 'offline', detail: null, preparationError: null };
  }
  if (
    !context.isAuthenticated ||
    context.contextKey === null ||
    (expectedContextKey !== null && context.contextKey !== expectedContextKey) ||
    (requireVerifiedCurrent && !context.isVerifiedCurrent)
  ) {
    return { code: 'context_unavailable', detail: null, preparationError: null };
  }
  if (context.optionsState.operation !== 'ready') {
    return {
      code: 'validation_failed',
      detail: null,
      preparationError: { code: 'options_unavailable', detail: null },
    };
  }
  return null;
};

const isBusy = (phase: ReceiptTransferCommitPhase): boolean =>
  [
    'validating',
    'local_save',
    'uploading',
    'local_commit_syncing',
    'conflict_syncing',
    'remote_commit_syncing',
  ].includes(phase);

export const createReceiptTransferCommitController = (
  saveService: TransferBatchSaveExportService = createAppTransferSaveExportService(),
  conflictRecoveryService: DatabaseConflictRecoveryService = createAppDatabaseConflictRecoveryService(),
  toastStore: Pick<ToastStore, 'show'> = appToastStore,
): ReceiptTransferCommitController => {
  let state = INITIAL_STATE;
  let generation = 0;
  let expectedContextKey: string | null = null;
  let pendingBytes: Uint8Array | null = null;
  let pendingETag: string | null = null;
  let pendingCommands: readonly CreateTransferInput[] | null = null;
  const listeners = new Set<(state: ReceiptTransferCommitState) => void>();

  const publish = (nextState: ReceiptTransferCommitState): void => {
    state = Object.freeze(nextState);
    listeners.forEach((listener) => listener(state));
  };

  const publishError = (
    phase: ReceiptTransferCommitPhase,
    error: ReceiptTransferCommitError,
  ): void => {
    publish({
      phase,
      createdCount: state.createdCount,
      error,
      progress: null,
      recoveryProgress: null,
    });
  };

  const validateCommands = (
    commands: readonly CreateTransferInput[],
    context: ReceiptTransferCommitContext,
    requireVerifiedCurrent: boolean,
  ): ReceiptTransferCommitError | null => {
    const invalidContext = contextError(context, expectedContextKey, requireVerifiedCurrent);
    if (invalidContext !== null) return invalidContext;
    const preparationError = validatePreparedReceiptTransferCommands(
      commands,
      context.optionsState,
    );
    return preparationError === null
      ? null
      : { code: 'validation_failed', detail: null, preparationError };
  };

  const setSaved = (createdCount: number, t: ReceiptTransferCommitTranslator): void => {
    pendingBytes = null;
    pendingETag = null;
    pendingCommands = null;
    publish({
      phase: 'saved',
      createdCount,
      error: null,
      progress: null,
      recoveryProgress: null,
    });
    toastStore.show(
      t(
        createdCount === 1
          ? 'addTransfer.receipt.commit.successOne'
          : 'addTransfer.receipt.commit.successMany',
        { values: { count: createdCount } },
      ),
      'success',
    );
  };

  const recoverRemoteCommit = async (
    token: number,
    createdCount: number,
    t: ReceiptTransferCommitTranslator,
  ): Promise<void> => {
    pendingBytes = null;
    pendingETag = null;
    pendingCommands = null;
    publish({
      phase: 'remote_commit_syncing',
      createdCount,
      error: null,
      progress: null,
      recoveryProgress: null,
    });
    try {
      await conflictRecoveryService.syncLatestDatabase({
        onProgress: (recoveryProgress) => {
          if (token !== generation) return;
          publish({ ...state, recoveryProgress });
        },
      });
      if (token !== generation) return;
      setSaved(createdCount, t);
    } catch (error) {
      if (token !== generation) return;
      publishError('remote_commit_recovery_failed', {
        code: 'remote_commit_recovery_failed',
        detail: detailFrom(error),
        preparationError: null,
      });
      toastStore.show(t('addTransfer.receipt.commit.remoteCommitRecoveryFailed'), 'error');
    }
  };

  const recoverUnexportedLocalCommit = async (
    token: number,
    t: ReceiptTransferCommitTranslator,
  ): Promise<void> => {
    pendingBytes = null;
    pendingETag = null;
    pendingCommands = null;
    conflictRecoveryService.discardStaleRuntime();
    publish({
      phase: 'local_commit_syncing',
      createdCount: state.createdCount,
      error: null,
      progress: null,
      recoveryProgress: null,
    });
    try {
      await conflictRecoveryService.syncLatestDatabase({
        onProgress: (recoveryProgress) => {
          if (token === generation) publish({ ...state, recoveryProgress });
        },
      });
      if (token !== generation) return;
      publishError('failed', {
        code: 'local_failed',
        detail: null,
        preparationError: null,
      });
      toastStore.show(t('addTransfer.receipt.commit.localFailed'), 'error');
    } catch (error) {
      if (token !== generation) return;
      publishError('local_commit_recovery_failed', {
        code: 'local_commit_recovery_failed',
        detail: detailFrom(error),
        preparationError: null,
      });
    }
  };

  const runBatch = async (
    commands: readonly CreateTransferInput[],
    t: ReceiptTransferCommitTranslator,
    token: number,
  ): Promise<void> => {
    pendingCommands = commands;
    publish({
      phase: 'local_save',
      createdCount: commands.length,
      error: null,
      progress: null,
      recoveryProgress: null,
    });
    try {
      const result = await saveService.createTransferBatchAndExport(commands, {
        onUploadStart: () => {
          if (token !== generation) return;
          publish({ ...state, phase: 'uploading', progress: null });
        },
        onProgress: (progress) => {
          if (token !== generation) return;
          publish({ ...state, phase: 'uploading', progress });
        },
      });
      if (token !== generation) return;
      setSaved(result.createdCount, t);
    } catch (error) {
      if (token !== generation) return;
      if (error instanceof TransferBatchUploadPendingError) {
        const cause = error.cause;
        if (cause instanceof DatabaseUploadError && cause.code === 'remote_commit_cache_failed') {
          await recoverRemoteCommit(token, error.pendingUpload.batchResult.createdCount, t);
          return;
        }
        if (cause instanceof DatabaseUploadError && cause.code === 'conflict') {
          pendingBytes = null;
          pendingETag = null;
          conflictRecoveryService.discardStaleRuntime();
          publishError('conflict', { code: 'conflict', detail: null, preparationError: null });
          toastStore.show(t('addTransfer.receipt.commit.conflict'), 'error');
          return;
        }
        if (cause instanceof DatabaseUploadError && cause.code === 'upload_failed') {
          if (cause.expectedETag === null) {
            await recoverUnexportedLocalCommit(token, t);
            return;
          }
          pendingBytes = error.pendingUpload.dbBytes;
          pendingETag = cause.expectedETag;
          pendingCommands = null;
          publishError('upload_failed', {
            code: 'upload_failed',
            detail: detailFrom(cause),
            preparationError: null,
          });
          toastStore.show(t('addTransfer.receipt.commit.uploadFailed'), 'error');
          return;
        }
        await recoverUnexportedLocalCommit(token, t);
        return;
      }
      if (error instanceof TransferBatchExportRecoveryRequiredError) {
        await recoverUnexportedLocalCommit(token, t);
        return;
      }
      pendingBytes = null;
      pendingETag = null;
      pendingCommands = null;
      publishError('failed', {
        code: 'local_failed',
        detail: detailFrom(error),
        preparationError: null,
      });
      toastStore.show(t('addTransfer.receipt.commit.localFailed'), 'error');
    }
  };

  return {
    getState: () => state,

    subscribe(listener): () => void {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    async commit(commands, context, t): Promise<void> {
      if (state.phase !== 'idle') return;
      expectedContextKey = context.contextKey;
      const token = ++generation;
      publish({
        phase: 'validating',
        createdCount: commands.length,
        error: null,
        progress: null,
        recoveryProgress: null,
      });
      const error = validateCommands(commands, context, true);
      if (error !== null) {
        pendingCommands = null;
        publishError('failed', error);
        return;
      }
      await runBatch(commands, t, token);
    },

    async retryUpload(context, t): Promise<void> {
      if (
        state.phase !== 'upload_failed' ||
        pendingBytes === null ||
        pendingETag === null ||
        isBusy(state.phase)
      )
        return;
      const error = contextError(context, expectedContextKey, false);
      if (error !== null) {
        publishError('upload_failed', error);
        return;
      }
      const token = generation;
      const bytes = pendingBytes;
      const expectedETag = pendingETag;
      try {
        publish({ ...state, phase: 'uploading', error: null, progress: null });
        await saveService.retryExportedDatabaseUpload(bytes, {
          expectedETag,
          onProgress: (progress) => {
            if (token === generation) publish({ ...state, progress });
          },
        });
        if (token !== generation) return;
        setSaved(state.createdCount, t);
      } catch (retryError) {
        if (token !== generation) return;
        if (
          retryError instanceof DatabaseUploadError &&
          retryError.code === 'remote_commit_cache_failed'
        ) {
          await recoverRemoteCommit(token, state.createdCount, t);
          return;
        }
        if (retryError instanceof DatabaseUploadError && retryError.code === 'conflict') {
          pendingBytes = null;
          pendingETag = null;
          pendingCommands = null;
          conflictRecoveryService.discardStaleRuntime();
          publish({ ...state, phase: 'conflict_syncing', error: null, recoveryProgress: null });
          try {
            await conflictRecoveryService.syncLatestDatabase({
              onProgress: (recoveryProgress) => {
                if (token === generation) publish({ ...state, recoveryProgress });
              },
            });
          } catch {
            // The stale runtime stays closed; this byte-only retry cannot safely recreate commands.
          } finally {
            if (token === generation) {
              publishError('failed', {
                code: 'context_changed',
                detail: null,
                preparationError: null,
              });
            }
          }
          return;
        }
        if (retryError instanceof DatabaseUploadError && retryError.code !== 'upload_failed') {
          pendingBytes = null;
          pendingETag = null;
          publishError('failed', {
            code: 'context_unavailable',
            detail: null,
            preparationError: null,
          });
          return;
        }
        publishError('upload_failed', {
          code: 'upload_failed',
          detail: detailFrom(retryError),
          preparationError: null,
        });
      }
    },

    async resolveConflict(loadCurrentContext, t): Promise<void> {
      if (state.phase !== 'conflict' || pendingCommands === null) return;
      const token = generation;
      publish({ ...state, phase: 'conflict_syncing', error: null, recoveryProgress: null });
      try {
        await conflictRecoveryService.syncLatestDatabase({
          onProgress: (recoveryProgress) => {
            if (token === generation) publish({ ...state, recoveryProgress });
          },
        });
        if (token !== generation) return;
        const context = await loadCurrentContext();
        if (token !== generation) return;
        const error = validateCommands(pendingCommands, context, true);
        if (error !== null) {
          publishError('failed', error);
          pendingCommands = null;
          return;
        }
        publish({ ...state, phase: 'conflict_ready', error: null, recoveryProgress: null });
        toastStore.show(t('addTransfer.receipt.commit.conflictReadyToast'), 'success');
      } catch (error) {
        if (token !== generation) return;
        publishError('conflict', {
          code: 'conflict_sync_failed',
          detail: detailFrom(error),
          preparationError: null,
        });
      }
    },

    async retryAfterConflict(context, t): Promise<void> {
      if (state.phase !== 'conflict_ready' || pendingCommands === null) return;
      const error = validateCommands(pendingCommands, context, true);
      if (error !== null) {
        pendingCommands = null;
        publishError('failed', error);
        return;
      }
      await runBatch(pendingCommands, t, generation);
    },

    async retryLocalCommitRecovery(t): Promise<void> {
      if (state.phase !== 'local_commit_recovery_failed') return;
      await recoverUnexportedLocalCommit(generation, t);
    },

    invalidate(): void {
      if (state.phase === 'idle' || state.phase === 'saved' || state.phase === 'invalidated')
        return;
      generation += 1;
      pendingBytes = null;
      pendingETag = null;
      pendingCommands = null;
      expectedContextKey = null;
      publishError('invalidated', {
        code: 'context_changed',
        detail: null,
        preparationError: null,
      });
    },

    reset(): void {
      generation += 1;
      pendingBytes = null;
      pendingETag = null;
      pendingCommands = null;
      expectedContextKey = null;
      publish(INITIAL_STATE);
    },
  };
};
