// Adapts validated manual form input to the shared transfer commit controller.
import type { CreateTransferInput } from '@db';
import { appToastStore, type ToastStore } from '@shared';
import {
  createTransferCommitController,
  type TransferCommitState,
  type TransferCommitContext,
} from '../transferCommitController';
import {
  createAppTransferSaveExportService,
  type TransferBatchSaveExportService,
  type DatabaseUploadProgress,
} from '../transferSaveExportService';
import {
  createAppDatabaseConflictRecoveryService,
  type DatabaseConflictRecoveryService,
  type DatabaseConflictRecoveryProgress,
} from '../databaseConflictRecoveryService';
import { appDatabaseSession } from '../databaseSession';
import {
  isoDateToEpochDay,
  NO_CATEGORY_SELECTED,
  type AddTransferAccountOption,
  type AddTransferFormFields,
} from '../../transfers/addTransferFormState';
import { parseAmountInputCents } from '../../transfers/addTransferAmountInput';
import type { AddTransferOptionsState } from './addTransferOptionsController';
import { validateAddTransfer } from '../../transfers/addTransferValidation';
import { deriveTransferType } from '../../transfers/transferTypeDerivation';

export type AddTransferSavePhase =
  | 'idle'
  | 'local_commit_syncing'
  | 'local_commit_recovery_failed'
  | 'invalidated'
  | 'local_save'
  | 'uploading'
  | 'upload_failed'
  | 'remote_commit_syncing'
  | 'remote_commit_recovered'
  | 'remote_commit_recovery_failed'
  | 'conflict'
  | 'conflict_syncing'
  | 'conflict_resolved'
  | 'local_failed'
  | 'saved';

export interface AddTransferSaveState {
  readonly phase: AddTransferSavePhase;
  readonly errorMessage: string | null;
  readonly progress: DatabaseUploadProgress | null;
  readonly recoveryProgress: DatabaseConflictRecoveryProgress | null;
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
  resolveConflict(t: AddTransferTranslator, isOffline?: boolean): Promise<void>;
  invalidate?(): void;
  reset(): void;
}

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

  const amountCents = parseAmountInputCents(fields.amount);
  if (amountCents === null) {
    throw new Error('Transfer amount is not valid.');
  }

  return {
    bookingDateEpochDay: isoDateToEpochDay(fields.date),
    name: fields.name.trim(),
    amountCents,
    transferTypeId: deriveTransferType(fromAccount.accountTypeId, toAccount.accountTypeId),
    fromAccountId: fromAccount.accountId,
    toAccountId: toAccount.accountId,
    categoryIds: selectedCategoryIds(fields),
    buyplace: fields.buyplace.trim().length > 0 ? fields.buyplace.trim() : null,
  };
};

const phases: Partial<Record<TransferCommitState['phase'], AddTransferSavePhase>> = {
  validating: 'local_save',
  failed: 'local_failed',
  conflict_ready: 'conflict_resolved',
};

export const createAddTransferSaveController = (
  saveService: TransferBatchSaveExportService = createAppTransferSaveExportService(),
  toastStore: Pick<ToastStore, 'show'> = appToastStore,
  conflictRecoveryService: DatabaseConflictRecoveryService = createAppDatabaseConflictRecoveryService(),
  resolveIdentity: () => Pick<
    TransferCommitContext,
    'isAuthenticated' | 'isVerifiedCurrent' | 'contextKey'
  > = () => {
    const identity = appDatabaseSession.identity();
    return {
      isAuthenticated: identity !== null,
      isVerifiedCurrent: appDatabaseSession.isWritable(),
      contextKey:
        identity === null
          ? null
          : JSON.stringify([identity.accountId, identity.binding.driveId, identity.binding.itemId]),
    };
  },
): AddTransferSaveController => {
  let translator: AddTransferTranslator = (key) => key;
  let optionsState: AddTransferOptionsState = {
    operation: 'loading',
    fromAccountOptions: [],
    toAccountOptions: [],
    categoryOptions: [],
    error: null,
  };
  const core = createTransferCommitController(
    saveService,
    conflictRecoveryService,
    toastStore,
    (commands, options) => {
      const command = commands[0];
      if (commands.length !== 1 || command === undefined || options.operation !== 'ready')
        return { code: 'invalid_transfer', detail: null };
      const source = findAccount(options.fromAccountOptions, command.fromAccountId);
      const destination = findAccount(options.toAccountOptions, command.toAccountId);
      return source === null ||
        destination === null ||
        deriveTransferType(source.accountTypeId, destination.accountTypeId) !==
          command.transferTypeId ||
        command.categoryIds.some(
          (id) => !options.categoryOptions.some((category) => category.categoryId === id),
        )
        ? { code: 'invalid_transfer', detail: null }
        : null;
    },
  );
  const context = (isOffline: boolean): TransferCommitContext => ({
    ...resolveIdentity(),
    isOnline: !isOffline,
    optionsState,
  });
  const adapt = (state: TransferCommitState): AddTransferSaveState => ({
    phase: phases[state.phase] ?? (state.phase as AddTransferSavePhase),
    errorMessage:
      state.error === null
        ? null
        : translator(`addTransfer.receipt.commit.errors.${state.error.code}`),
    progress: state.progress,
    recoveryProgress: state.recoveryProgress,
    canRetry: state.phase === 'upload_failed',
  });
  const translate =
    (t: AddTransferTranslator) =>
    (key: string): string =>
      t(key === 'addTransfer.receipt.commit.successOne' ? 'addTransfer.save.successToast' : key);
  return {
    getState: () => adapt(core.getState()),
    subscribe(listener) {
      return core.subscribe((state) => listener(adapt(state)));
    },
    async submit(fields, options, t, isOffline = false) {
      if (isOffline) return { validationErrors: [] };
      const phase = core.getState().phase;
      if (!['idle', 'failed', 'conflict_ready', 'saved'].includes(phase))
        return { validationErrors: [] };
      if (options.operation !== 'ready')
        return { validationErrors: [t('addTransfer.validation.optionsUnavailable')] };
      const validationErrors = validateAddTransfer(
        fields,
        options.fromAccountOptions,
        options.toAccountOptions,
        t,
      );
      if (validationErrors.length > 0) return { validationErrors };
      translator = t;
      optionsState = options;
      core.reset();
      const command = toCreateTransferInput(fields, options);
      await core.commit(
        Object.freeze([
          Object.freeze({ ...command, categoryIds: Object.freeze([...command.categoryIds]) }),
        ]),
        context(isOffline),
        translate(t),
      );
      return { validationErrors: [] };
    },
    async retry(t, isOffline = false) {
      await core.retryUpload(context(isOffline), translate(t));
    },
    async resolveConflict(t, isOffline = false) {
      if (isOffline) return;
      if (core.getState().phase === 'local_commit_recovery_failed') {
        await core.retryLocalCommitRecovery(translate(t));
      } else {
        await core.resolveConflict(async () => context(false), translate(t));
      }
    },
    invalidate: () => core.invalidate(),
    reset: () => core.reset(),
  };
};
