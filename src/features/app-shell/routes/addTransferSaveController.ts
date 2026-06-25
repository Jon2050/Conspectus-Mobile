// Orchestrates Add Transfer submit, upload progress, retry state, and user feedback.
import { DatabaseUploadError } from '../databaseUploadHandoffService';
import {
  createAppTransferSaveExportService,
  TransferUploadPendingError,
  type DatabaseUploadProgress,
  type PendingTransferUpload,
  type TransferSaveExportService,
} from '../transferSaveExportService';
import type { ToastStore } from '@shared';
import { appToastStore } from '@shared';
import type { CreateTransferInput } from '@db';

import {
  isoDateToEpochDay,
  NO_CATEGORY_SELECTED,
  type AddTransferAccountOption,
  type AddTransferFormFields,
} from './addTransferFormState';
import type { AddTransferOptionsState } from './addTransferOptionsController';
import { validateAddTransfer } from './addTransferValidation';
import { deriveTransferType } from './transferTypeDerivation';

export type AddTransferSavePhase =
  | 'idle'
  | 'local_save'
  | 'uploading'
  | 'upload_failed'
  | 'conflict'
  | 'local_failed'
  | 'saved';

export interface AddTransferSaveState {
  readonly phase: AddTransferSavePhase;
  readonly errorMessage: string | null;
  readonly progress: DatabaseUploadProgress | null;
  readonly canRetry: boolean;
}

export type AddTransferSaveStateListener = (state: AddTransferSaveState) => void;
export type AddTransferTranslator = (key: string) => string;

export interface AddTransferSubmitResult {
  readonly validationErrors: readonly string[];
}

export interface AddTransferSaveController {
  getState(): AddTransferSaveState;
  subscribe(listener: AddTransferSaveStateListener): () => void;
  submit(
    fields: AddTransferFormFields,
    optionsState: AddTransferOptionsState,
    t: AddTransferTranslator,
    isOffline?: boolean,
  ): Promise<AddTransferSubmitResult>;
  retry(t: AddTransferTranslator, isOffline?: boolean): Promise<void>;
  reset(): void;
}

const INITIAL_STATE: AddTransferSaveState = {
  phase: 'idle',
  errorMessage: null,
  progress: null,
  canRetry: false,
};

const isBusyPhase = (phase: AddTransferSavePhase): boolean =>
  phase === 'local_save' || phase === 'uploading';

const parseAmountCents = (amount: string): number =>
  Math.round(Number.parseFloat(amount.trim().replace(',', '.')) * 100);

const selectedCategoryIds = (fields: AddTransferFormFields): readonly number[] =>
  [fields.category1Id, fields.category2Id, fields.category3Id].filter(
    (categoryId) => categoryId !== NO_CATEGORY_SELECTED,
  );

const findAccount = (
  accounts: readonly AddTransferAccountOption[],
  accountId: number | null,
): AddTransferAccountOption | null =>
  accountId === null ? null : (accounts.find((account) => account.accountId === accountId) ?? null);

const toCreateTransferInput = (
  fields: AddTransferFormFields,
  optionsState: AddTransferOptionsState,
): CreateTransferInput => {
  const fromAccount = findAccount(optionsState.fromAccountOptions, fields.fromAccountId);
  const toAccount = findAccount(optionsState.toAccountOptions, fields.toAccountId);

  if (fromAccount === null || toAccount === null) {
    throw new Error('Selected transfer accounts are no longer available.');
  }

  return {
    bookingDateEpochDay: isoDateToEpochDay(fields.date),
    name: fields.name.trim(),
    amountCents: parseAmountCents(fields.amount),
    transferTypeId: deriveTransferType(fromAccount.accountTypeId, toAccount.accountTypeId),
    fromAccountId: fromAccount.accountId,
    toAccountId: toAccount.accountId,
    categoryIds: selectedCategoryIds(fields),
    buyplace: fields.buyplace.trim().length > 0 ? fields.buyplace.trim() : null,
  };
};

const isRetryableUploadError = (error: TransferUploadPendingError): boolean =>
  error.cause instanceof DatabaseUploadError ? error.cause.code === 'upload_failed' : true;

const toLocalErrorMessage = (error: unknown, fallbackMessage: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallbackMessage;

const toUploadErrorMessage = (
  error: TransferUploadPendingError,
  fallbackMessage: string,
): string =>
  error.cause instanceof Error && error.cause.message.trim().length > 0
    ? error.cause.message
    : fallbackMessage;

export const createAddTransferSaveController = (
  saveService: TransferSaveExportService = createAppTransferSaveExportService(),
  toastStore: Pick<ToastStore, 'show'> = appToastStore,
): AddTransferSaveController => {
  let state = INITIAL_STATE;
  let pendingUpload: PendingTransferUpload | null = null;
  const listeners = new Set<AddTransferSaveStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<AddTransferSaveState>): void => {
    state = { ...state, ...patch };
    emitState();
  };

  const setUploadStarted = (): void => {
    updateState({
      phase: 'uploading',
      errorMessage: null,
      progress: null,
      canRetry: false,
    });
  };

  const setUploadProgress = (progress: DatabaseUploadProgress): void => {
    updateState({
      phase: 'uploading',
      progress,
    });
  };

  const setSaved = (t: AddTransferTranslator): void => {
    pendingUpload = null;
    updateState({
      phase: 'saved',
      errorMessage: null,
      progress: null,
      canRetry: false,
    });
    toastStore.show(t('addTransfer.save.successToast'), 'success');
  };

  const setUploadFailure = (error: TransferUploadPendingError, t: AddTransferTranslator): void => {
    pendingUpload = error.pendingUpload;
    const canRetry = isRetryableUploadError(error);
    const phase: AddTransferSavePhase = canRetry ? 'upload_failed' : 'conflict';
    const message = toUploadErrorMessage(error, t('addTransfer.save.uploadFailed'));

    updateState({
      phase,
      errorMessage: message,
      progress: null,
      canRetry,
    });

    toastStore.show(
      canRetry ? t('addTransfer.save.uploadFailedToast') : t('addTransfer.save.conflictToast'),
      'error',
    );
  };

  return {
    getState(): AddTransferSaveState {
      return state;
    },

    subscribe(listener: AddTransferSaveStateListener): () => void {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },

    async submit(
      fields: AddTransferFormFields,
      optionsState: AddTransferOptionsState,
      t: AddTransferTranslator,
      isOffline: boolean = false,
    ): Promise<AddTransferSubmitResult> {
      if (isOffline) {
        return { validationErrors: [] };
      }

      if (isBusyPhase(state.phase)) {
        return { validationErrors: [] };
      }

      const validationErrors = validateAddTransfer(
        fields,
        optionsState.fromAccountOptions,
        optionsState.toAccountOptions,
        t,
      );
      if (validationErrors.length > 0) {
        return { validationErrors };
      }

      pendingUpload = null;
      updateState({
        phase: 'local_save',
        errorMessage: null,
        progress: null,
        canRetry: false,
      });

      try {
        await saveService.createTransferAndExport(toCreateTransferInput(fields, optionsState), {
          onUploadStart: setUploadStarted,
          onProgress: setUploadProgress,
        });
        setSaved(t);
      } catch (error) {
        if (error instanceof TransferUploadPendingError) {
          setUploadFailure(error, t);
        } else {
          updateState({
            phase: 'local_failed',
            errorMessage: toLocalErrorMessage(error, t('addTransfer.save.localFailed')),
            progress: null,
            canRetry: false,
          });
          toastStore.show(t('addTransfer.save.localFailedToast'), 'error');
        }
      }

      return { validationErrors: [] };
    },

    async retry(t: AddTransferTranslator, isOffline: boolean = false): Promise<void> {
      if (isOffline) {
        return;
      }

      if (isBusyPhase(state.phase) || pendingUpload === null || !state.canRetry) {
        return;
      }

      try {
        await saveService.retryExportedDatabaseUpload(pendingUpload.dbBytes, {
          onUploadStart: setUploadStarted,
          onProgress: setUploadProgress,
        });
        setSaved(t);
      } catch (error) {
        if (error instanceof DatabaseUploadError && error.code === 'conflict') {
          updateState({
            phase: 'conflict',
            errorMessage: error.message,
            progress: null,
            canRetry: false,
          });
          toastStore.show(t('addTransfer.save.conflictToast'), 'error');
          return;
        }

        updateState({
          phase: 'upload_failed',
          errorMessage: toLocalErrorMessage(error, t('addTransfer.save.uploadFailed')),
          progress: null,
          canRetry: true,
        });
        toastStore.show(t('addTransfer.save.retryFailedToast'), 'error');
      }
    },

    reset(): void {
      pendingUpload = null;
      updateState(INITIAL_STATE);
    },
  };
};
