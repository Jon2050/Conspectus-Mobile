// Owns the shared persistence state machine for manual transfers and receipt batches.
import type { CreateTransferInput } from '@db';
import type { ToastStore } from '@shared';

import type { ReceiptTransferPreparationError } from '../receipt';
import type { AddTransferOptionsState } from './routes/addTransferOptionsController';
import { DatabaseUploadError } from './databaseUploadHandoffService';
import {
  type DatabaseConflictRecoveryProgress,
  type DatabaseConflictRecoveryService,
} from './databaseConflictRecoveryService';
import {
  TransferBatchExportRecoveryRequiredError,
  TransferBatchUploadPendingError,
  type DatabaseUploadProgress,
  type DatabaseUploadOptions,
  type PendingTransferBatchUpload,
  type TransferBatchSaveExportService,
} from './transferSaveExportService';

export type TransferCommitPhase =
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

export type TransferCommitErrorCode =
  | 'offline'
  | 'context_unavailable'
  | 'context_changed'
  | 'validation_failed'
  | 'local_failed'
  | 'local_commit_recovery_failed'
  | 'upload_failed'
  | 'remote_outcome_unknown'
  | 'conflict'
  | 'conflict_sync_failed'
  | 'remote_commit_recovery_failed';

export interface TransferCommitError {
  readonly code: TransferCommitErrorCode;
  readonly detail: string | null;
  readonly preparationError: ReceiptTransferPreparationError | null;
}

export interface TransferCommitState {
  readonly phase: TransferCommitPhase;
  readonly createdCount: number;
  readonly error: TransferCommitError | null;
  readonly progress: DatabaseUploadProgress | null;
  readonly recoveryProgress: DatabaseConflictRecoveryProgress | null;
}

export interface TransferCommitContext {
  readonly isOnline: boolean;
  readonly isAuthenticated: boolean;
  readonly isVerifiedCurrent: boolean;
  readonly contextKey: string | null;
  readonly optionsState: AddTransferOptionsState;
}

export type TransferCommitTranslator = (
  key: string,
  options?: { readonly values?: Record<string, string | number> },
) => string;

export interface TransferCommitController {
  getState(): TransferCommitState;
  subscribe(listener: (state: TransferCommitState) => void): () => void;
  commit(
    commands: readonly CreateTransferInput[],
    context: TransferCommitContext,
    t: TransferCommitTranslator,
  ): Promise<void>;
  retryUpload(context: TransferCommitContext, t: TransferCommitTranslator): Promise<void>;
  resolveConflict(
    loadCurrentContext: () => Promise<TransferCommitContext>,
    t: TransferCommitTranslator,
  ): Promise<void>;
  retryAfterConflict(context: TransferCommitContext, t: TransferCommitTranslator): Promise<void>;
  retryLocalCommitRecovery(t: TransferCommitTranslator): Promise<void>;
  invalidate(): void;
  reset(): void;
}

const INITIAL_STATE: TransferCommitState = Object.freeze({
  phase: 'idle',
  createdCount: 0,
  error: null,
  progress: null,
  recoveryProgress: null,
});

const detailFrom = (error: unknown): string | null =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : null;

const contextError = (
  context: TransferCommitContext,
  expectedContextKey: string | null,
  requireVerifiedCurrent: boolean,
): TransferCommitError | null => {
  if (!context.isOnline) {
    return { code: 'offline', detail: null, preparationError: null };
  }
  if (expectedContextKey !== null && context.contextKey !== expectedContextKey) {
    return { code: 'context_changed', detail: null, preparationError: null };
  }
  if (
    !context.isAuthenticated ||
    context.contextKey === null ||
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

export const createTransferCommitController = (
  saveService: TransferBatchSaveExportService,
  conflictRecoveryService: DatabaseConflictRecoveryService,
  toastStore: Pick<ToastStore, 'show'>,
  validate: (
    commands: readonly CreateTransferInput[],
    options: AddTransferOptionsState,
  ) => ReceiptTransferPreparationError | null,
): TransferCommitController => {
  let state = INITIAL_STATE;
  let generation = 0;
  let expectedContextKey: string | null = null;
  let pendingBytes: Uint8Array | null = null;
  let pendingETag: string | null = null;
  let pendingContext: DatabaseUploadOptions['context'];
  let outcomeIsUnknown = false;
  let pendingCommands: readonly CreateTransferInput[] | null = null;
  const listeners = new Set<(state: TransferCommitState) => void>();

  const publish = (nextState: TransferCommitState): void => {
    state = Object.freeze(nextState);
    listeners.forEach((listener) => listener(state));
  };

  const publishError = (phase: TransferCommitPhase, error: TransferCommitError): void => {
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
    context: TransferCommitContext,
    requireVerifiedCurrent: boolean,
  ): TransferCommitError | null => {
    const invalidContext = contextError(context, expectedContextKey, requireVerifiedCurrent);
    if (invalidContext !== null) return invalidContext;
    const preparationError = validate(commands, context.optionsState);
    return preparationError === null
      ? null
      : { code: 'validation_failed', detail: null, preparationError };
  };

  const setSaved = (createdCount: number, t: TransferCommitTranslator): void => {
    outcomeIsUnknown = false;
    pendingBytes = null;
    pendingETag = null;
    pendingContext = undefined;
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
    t: TransferCommitTranslator,
  ): Promise<void> => {
    pendingBytes = null;
    pendingETag = null;
    pendingContext = undefined;
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
    t: TransferCommitTranslator,
  ): Promise<void> => {
    pendingBytes = null;
    pendingETag = null;
    pendingContext = undefined;
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

  // Both initial upload and byte-only retry share this classification. Commands survive
  // only a definitive first-attempt conflict; a lost acknowledgement never permits replay.
  const handleUploadFailure = async (
    error: unknown,
    token: number,
    t: TransferCommitTranslator,
    exported?: PendingTransferBatchUpload,
  ): Promise<void> => {
    if (error instanceof DatabaseUploadError && error.code === 'remote_commit_cache_failed') {
      await recoverRemoteCommit(token, state.createdCount, t);
      return;
    }
    if (error instanceof DatabaseUploadError && error.code === 'context_changed') {
      pendingBytes = null;
      pendingETag = null;
      pendingContext = undefined;
      pendingCommands = null;
      publishError('invalidated', {
        code: outcomeIsUnknown ? 'remote_outcome_unknown' : 'context_changed',
        detail: null,
        preparationError: null,
      });
      return;
    }
    if (error instanceof DatabaseUploadError && error.code === 'conflict') {
      pendingBytes = null;
      pendingETag = null;
      pendingContext = undefined;
      conflictRecoveryService.discardStaleRuntime();
      if (pendingCommands !== null) {
        publishError('conflict', { code: 'conflict', detail: null, preparationError: null });
        toastStore.show(t('addTransfer.receipt.commit.conflict'), 'error');
        return;
      }
      publish({ ...state, phase: 'conflict_syncing', error: null, recoveryProgress: null });
      try {
        await conflictRecoveryService.syncLatestDatabase({
          onProgress: (recoveryProgress) => {
            if (token === generation) publish({ ...state, recoveryProgress });
          },
        });
      } catch {
        // No replay: a byte-only retry cannot establish whether the previous PUT committed.
      }
      if (token === generation)
        publishError('failed', {
          code: outcomeIsUnknown ? 'remote_outcome_unknown' : 'context_changed',
          detail: null,
          preparationError: null,
        });
      return;
    }
    if (
      !(error instanceof DatabaseUploadError) ||
      error.code === 'upload_failed' ||
      error.code === 'remote_outcome_unknown'
    ) {
      if (exported !== undefined) {
        pendingBytes = exported.dbBytes;
        pendingETag =
          exported.context?.baseETag ??
          (error instanceof DatabaseUploadError ? error.expectedETag : null);
        pendingContext = exported.context;
      }
      if (pendingETag === null) {
        await recoverUnexportedLocalCommit(token, t);
        return;
      }
      outcomeIsUnknown ||=
        !(error instanceof DatabaseUploadError) || error.code === 'remote_outcome_unknown';
      pendingCommands = null;
      publishError('upload_failed', {
        code: outcomeIsUnknown ? 'remote_outcome_unknown' : 'upload_failed',
        detail: detailFrom(error),
        preparationError: null,
      });
      toastStore.show(
        t(
          outcomeIsUnknown
            ? 'addTransfer.receipt.commit.errors.remote_outcome_unknown'
            : 'addTransfer.receipt.commit.uploadFailed',
        ),
        'error',
      );
      return;
    }
    await recoverUnexportedLocalCommit(token, t);
  };

  const runBatch = async (
    commands: readonly CreateTransferInput[],
    t: TransferCommitTranslator,
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
        await handleUploadFailure(error.cause, token, t, error.pendingUpload);
        return;
      }
      if (error instanceof TransferBatchExportRecoveryRequiredError) {
        await recoverUnexportedLocalCommit(token, t);
        return;
      }
      pendingBytes = null;
      pendingETag = null;
      pendingContext = undefined;
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
      if (state.phase !== 'upload_failed' || pendingBytes === null || pendingETag === null) return;
      const error = contextError(context, expectedContextKey, false);
      if (error !== null) {
        if (error.code !== 'offline') {
          pendingBytes = null;
          pendingETag = null;
          pendingContext = undefined;
          pendingCommands = null;
        }
        publishError(
          error.code === 'offline' ? 'upload_failed' : 'invalidated',
          outcomeIsUnknown && error.code !== 'offline'
            ? { ...error, code: 'remote_outcome_unknown' }
            : error,
        );
        return;
      }
      const token = generation;
      const bytes = pendingBytes;
      const expectedETag = pendingETag;
      try {
        publish({ ...state, phase: 'uploading', error: null, progress: null });
        await saveService.retryExportedDatabaseUpload(bytes, {
          expectedETag,
          ...(pendingContext === undefined ? {} : { context: pendingContext }),
          onProgress: (progress) => {
            if (token === generation) publish({ ...state, progress });
          },
        });
        if (token !== generation) return;
        setSaved(state.createdCount, t);
      } catch (retryError) {
        if (token !== generation) return;
        await handleUploadFailure(retryError, token, t);
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
      outcomeIsUnknown ||= state.phase === 'uploading';
      pendingBytes = null;
      pendingETag = null;
      pendingContext = undefined;
      pendingCommands = null;
      expectedContextKey = null;
      publishError('invalidated', {
        code: outcomeIsUnknown ? 'remote_outcome_unknown' : 'context_changed',
        detail: null,
        preparationError: null,
      });
    },

    reset(): void {
      outcomeIsUnknown = false;
      generation += 1;
      pendingBytes = null;
      pendingETag = null;
      pendingContext = undefined;
      pendingCommands = null;
      expectedContextKey = null;
      publish(INITIAL_STATE);
    },
  };
};
