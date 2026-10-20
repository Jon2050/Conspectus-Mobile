// Receipt-specific public names for the common transfer persistence controller.
export {
  type TransferCommitContext as ReceiptTransferCommitContext,
  type TransferCommitController as ReceiptTransferCommitController,
  type TransferCommitState as ReceiptTransferCommitState,
  type TransferCommitPhase as ReceiptTransferCommitPhase,
  type TransferCommitErrorCode as ReceiptTransferCommitErrorCode,
  type TransferCommitError as ReceiptTransferCommitError,
  type TransferCommitTranslator as ReceiptTransferCommitTranslator,
} from './transferCommitController';

import { appToastStore, type ToastStore } from '@shared';
import { validatePreparedReceiptTransferCommands } from '../receipt';
import { createTransferCommitController } from './transferCommitController';
import {
  createAppTransferSaveExportService,
  type TransferBatchSaveExportService,
} from './transferSaveExportService';
import {
  createAppDatabaseConflictRecoveryService,
  type DatabaseConflictRecoveryService,
} from './databaseConflictRecoveryService';

export const createReceiptTransferCommitController = (
  service: TransferBatchSaveExportService = createAppTransferSaveExportService(),
  recovery: DatabaseConflictRecoveryService = createAppDatabaseConflictRecoveryService(),
  toasts: Pick<ToastStore, 'show'> = appToastStore,
) =>
  createTransferCommitController(
    service,
    recovery,
    toasts,
    validatePreparedReceiptTransferCommands,
  );
