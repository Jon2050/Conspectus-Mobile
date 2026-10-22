// Reuses the existing commit/retry/recovery boundary for transfer edits and deletion.
import {
  appTransferMutationService,
  resolveAppBrowserDbRuntime,
  type TransferRecord,
  type TransferMutationService,
} from '@db';
import { appToastStore, MILLIS_PER_DAY, type ToastStore } from '@shared';
import { appDatabaseSession } from '../databaseSession';
import { createAppDatabaseUploadHandoffService } from '../databaseUploadHandoffService';
import {
  createTransferSaveExportService,
  type TransferBatchSaveExportService,
} from '../transferSaveExportService';
import {
  createTransferCommitController,
  type TransferCommitContext,
  type TransferCommitTranslator,
} from '../transferCommitController';
import {
  createAppDatabaseConflictRecoveryService,
  type DatabaseConflictRecoveryService,
} from '../databaseConflictRecoveryService';
import {
  type AddTransferFormFields,
  NO_CATEGORY_SELECTED,
} from '../../transfers/addTransferFormState';
import { formatAmountInputDigits } from '../../transfers/addTransferAmountInput';
import { deriveTransferType } from '../../transfers/transferTypeDerivation';
import { validateAddTransfer } from '../../transfers/addTransferValidation';
import { toCreateTransferInput } from './addTransferSaveController';
import type { AddTransferOptionsState } from './addTransferOptionsController';

export const transferToFormFields = (transfer: TransferRecord): AddTransferFormFields => ({
  date: new Date(transfer.bookingDateEpochDay * MILLIS_PER_DAY).toISOString().slice(0, 10),
  name: transfer.name,
  amount: formatAmountInputDigits(String(transfer.amountCents)),
  fromAccountId: transfer.fromAccountId,
  toAccountId: transfer.toAccountId,
  category1Id: transfer.categoryIds[0] ?? NO_CATEGORY_SELECTED,
  category2Id: transfer.categoryIds[1] ?? NO_CATEGORY_SELECTED,
  category3Id: transfer.categoryIds[2] ?? NO_CATEGORY_SELECTED,
  buyplace: transfer.buyplace ?? '',
});

export const createEditTransferController = (
  original: TransferRecord,
  dependencies: {
    mutationService?: TransferMutationService;
    createSaveService?: (
      write: Parameters<typeof createTransferSaveExportService>[0],
    ) => TransferBatchSaveExportService;
    recovery?: DatabaseConflictRecoveryService;
    toast?: Pick<ToastStore, 'show'>;
    resolveIdentity?: () => Pick<
      TransferCommitContext,
      'isAuthenticated' | 'isVerifiedCurrent' | 'contextKey'
    >;
  } = {},
) => {
  const snapshot = Object.freeze({
    ...original,
    categoryIds: Object.freeze([...original.categoryIds]),
  });
  let deleting = false;
  const mutation = dependencies.mutationService ?? appTransferMutationService;
  const writer = {
    createTransfers(
      inputs: Parameters<TransferBatchSaveExportService['createTransferBatchAndExport']>[0],
    ) {
      if (deleting) mutation.deleteTransfer(snapshot);
      else {
        const replacement = inputs[0];
        if (inputs.length !== 1 || replacement === undefined)
          throw new Error('Expected one replacement transfer.');
        mutation.updateTransfer(snapshot, replacement);
      }
      return {
        transferIds: [snapshot.transferId],
        createdCount: 1,
        persistedAtIso: new Date().toISOString(),
      };
    },
  };
  const saveService =
    dependencies.createSaveService?.(writer) ??
    createTransferSaveExportService(
      writer,
      resolveAppBrowserDbRuntime,
      createAppDatabaseUploadHandoffService(),
      appDatabaseSession,
    );
  const core = createTransferCommitController(
    saveService,
    dependencies.recovery ?? createAppDatabaseConflictRecoveryService(),
    dependencies.toast ?? appToastStore,
    (commands, options) => {
      if (deleting) return null;
      const command = commands[0];
      if (command === undefined || options.operation !== 'ready')
        return { code: 'invalid_transfer', detail: null };
      const fields = transferToFormFields({ ...command, transferId: snapshot.transferId });
      const errors = validateAddTransfer(
        fields,
        options.fromAccountOptions,
        options.toAccountOptions,
        (key) => key,
      );
      const source = options.fromAccountOptions.find(
        (account) => account.accountId === command.fromAccountId,
      );
      const target = options.toAccountOptions.find(
        (account) => account.accountId === command.toAccountId,
      );
      return source === undefined ||
        target === undefined ||
        deriveTransferType(source.accountTypeId, target.accountTypeId) !== command.transferTypeId ||
        errors.length > 0 ||
        command.categoryIds.some(
          (id) => !options.categoryOptions.some((category) => category.categoryId === id),
        )
        ? { code: 'invalid_transfer', detail: null }
        : null;
    },
  );
  const resolveIdentity =
    dependencies.resolveIdentity ??
    (() => {
      const identity = appDatabaseSession.identity();
      return {
        isAuthenticated: identity !== null,
        isVerifiedCurrent: appDatabaseSession.isWritable(),
        contextKey:
          identity === null
            ? null
            : JSON.stringify([
                identity.accountId,
                identity.binding.driveId,
                identity.binding.itemId,
              ]),
      };
    });
  let optionsState: AddTransferOptionsState;
  const context = (offline: boolean): TransferCommitContext => ({
    ...resolveIdentity(),
    isOnline: !offline,
    optionsState,
  });
  const translate =
    (t: TransferCommitTranslator): TransferCommitTranslator =>
    (key, options) =>
      t(
        key === 'addTransfer.receipt.commit.successOne' ||
          key === 'addTransfer.receipt.commit.successMany'
          ? deleting
            ? 'editTransfer.deleted'
            : 'editTransfer.saved'
          : key === 'addTransfer.receipt.commit.localFailed'
            ? 'editTransfer.localFailed'
            : key,
        options,
      );
  return {
    getState: core.getState,
    subscribe: core.subscribe,
    invalidate: core.invalidate,
    async submit(
      fields: AddTransferFormFields,
      options: AddTransferOptionsState,
      t: TransferCommitTranslator,
      offline = false,
    ) {
      if (!['idle', 'failed'].includes(core.getState().phase) || offline) return [];
      if (options.operation !== 'ready') return [t('addTransfer.validation.optionsUnavailable')];
      const errors = validateAddTransfer(
        fields,
        options.fromAccountOptions,
        options.toAccountOptions,
        t,
      );
      if (errors.length > 0) return errors;
      optionsState = options;
      deleting = false;
      const command = toCreateTransferInput(fields, options);
      core.reset();
      await core.commit(
        [Object.freeze({ ...command, categoryIds: Object.freeze([...command.categoryIds]) })],
        context(offline),
        translate(t),
      );
      return [];
    },
    async remove(options: AddTransferOptionsState, t: TransferCommitTranslator, offline = false) {
      if (!['idle', 'failed'].includes(core.getState().phase) || offline) return;
      optionsState = options;
      deleting = true;
      core.reset();
      await core.commit([], context(offline), translate(t));
    },
    retry: (t: TransferCommitTranslator, offline = false) =>
      core.retryUpload(context(offline), translate(t)),
    resolveConflict: (
      loadOptions: () => Promise<AddTransferOptionsState>,
      t: TransferCommitTranslator,
    ) =>
      core.resolveConflict(async () => {
        optionsState = await loadOptions();
        return context(false);
      }, translate(t)),
    retryAfterConflict: (t: TransferCommitTranslator, offline = false) =>
      core.retryAfterConflict(context(offline), translate(t)),
    retryLocalRecovery: (t: TransferCommitTranslator) =>
      core.retryLocalCommitRecovery(translate(t)),
  };
};

export type EditTransferController = ReturnType<typeof createEditTransferController>;
