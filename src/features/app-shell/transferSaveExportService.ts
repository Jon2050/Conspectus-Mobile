// Coordinates a committed local transfer write with SQLite byte export for upload handoff.
import {
  appTransferWriteService,
  DbRuntimeError,
  resolveAppBrowserDbRuntime,
  type BrowserDbRuntime,
  type CreateTransferBatchResult,
  type CreateTransferInput,
  type CreateTransferResult,
  type TransferWriteService,
} from '@db';

import { createAppDatabaseUploadHandoffService } from './databaseUploadHandoffService';

export interface DatabaseUploadHandoff {
  uploadExportedDatabase(dbBytes: Uint8Array, options?: DatabaseUploadOptions): Promise<void>;
}

export interface DatabaseUploadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number | null;
}

export interface DatabaseUploadOptions {
  readonly onUploadStart?: () => void;
  readonly onProgress?: (progress: DatabaseUploadProgress) => void;
  readonly expectedETag?: string;
}

export interface TransferSaveExportService {
  createTransferAndExport(
    input: CreateTransferInput,
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferResult>;
  retryExportedDatabaseUpload(dbBytes: Uint8Array, options?: DatabaseUploadOptions): Promise<void>;
}

export interface TransferBatchSaveExportService extends TransferSaveExportService {
  createTransferBatchAndExport(
    inputs: readonly CreateTransferInput[],
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferBatchResult>;
}

export interface PendingTransferUpload {
  readonly transferResult: CreateTransferResult;
  readonly dbBytes: Uint8Array;
}

export interface PendingTransferBatchUpload {
  readonly batchResult: CreateTransferBatchResult;
  readonly dbBytes: Uint8Array;
}

export class TransferUploadPendingError extends Error {
  readonly pendingUpload: PendingTransferUpload;
  readonly cause?: unknown;

  constructor(pendingUpload: PendingTransferUpload, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Uploading the transfer failed.');
    this.name = 'TransferUploadPendingError';
    this.pendingUpload = pendingUpload;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class TransferBatchUploadPendingError extends Error {
  readonly pendingUpload: PendingTransferBatchUpload;
  readonly cause?: unknown;

  constructor(pendingUpload: PendingTransferBatchUpload, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Uploading the transfer batch failed.');
    this.name = 'TransferBatchUploadPendingError';
    this.pendingUpload = pendingUpload;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export class TransferBatchExportRecoveryRequiredError extends Error {
  readonly batchResult: CreateTransferBatchResult;
  readonly cause?: unknown;

  constructor(batchResult: CreateTransferBatchResult, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Exporting the transfer batch failed.');
    this.name = 'TransferBatchExportRecoveryRequiredError';
    this.batchResult = batchResult;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

type TransferWriteOperations = Pick<TransferWriteService, 'createTransfer'> &
  Partial<Pick<TransferWriteService, 'createTransfers'>>;

type TransferExportRuntime = Pick<BrowserDbRuntime, 'exportBytes'>;
type TransferExportRuntimeProvider = TransferExportRuntime | (() => TransferExportRuntime);

const resolveTransferExportRuntime = (
  provider: TransferExportRuntimeProvider,
): TransferExportRuntime => (typeof provider === 'function' ? provider() : provider);

const cloneExportedBytes = (dbBytes: Uint8Array): Uint8Array => {
  if (dbBytes.length === 0) {
    throw new DbRuntimeError(
      'db_export_failed',
      'The SQLite database export was empty and cannot be uploaded.',
    );
  }

  return new Uint8Array(dbBytes);
};

export const createTransferSaveExportService = (
  transferWriteService: TransferWriteOperations,
  dbRuntime: TransferExportRuntimeProvider,
  uploadHandoff: DatabaseUploadHandoff,
): TransferBatchSaveExportService => ({
  async createTransferAndExport(
    input: CreateTransferInput,
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferResult> {
    const transferResult = transferWriteService.createTransfer(input);
    const exportedBytes = cloneExportedBytes(resolveTransferExportRuntime(dbRuntime).exportBytes());

    try {
      options?.onUploadStart?.();
      await uploadHandoff.uploadExportedDatabase(exportedBytes, options);
    } catch (error) {
      throw new TransferUploadPendingError(
        {
          transferResult,
          dbBytes: exportedBytes,
        },
        error,
      );
    }

    return transferResult;
  },

  async createTransferBatchAndExport(
    inputs: readonly CreateTransferInput[],
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferBatchResult> {
    if (transferWriteService.createTransfers === undefined) {
      throw new DbRuntimeError('db_query_failed', 'Batch transfer writes are unavailable.');
    }
    const batchResult = transferWriteService.createTransfers(inputs);
    let exportedBytes: Uint8Array;
    try {
      exportedBytes = cloneExportedBytes(resolveTransferExportRuntime(dbRuntime).exportBytes());
    } catch (error) {
      throw new TransferBatchExportRecoveryRequiredError(batchResult, error);
    }

    try {
      options?.onUploadStart?.();
      await uploadHandoff.uploadExportedDatabase(exportedBytes, options);
    } catch (error) {
      throw new TransferBatchUploadPendingError(
        {
          batchResult,
          dbBytes: exportedBytes,
        },
        error,
      );
    }

    return batchResult;
  },

  async retryExportedDatabaseUpload(
    dbBytes: Uint8Array,
    options?: DatabaseUploadOptions,
  ): Promise<void> {
    options?.onUploadStart?.();
    await uploadHandoff.uploadExportedDatabase(dbBytes, options);
  },
});

export const createAppTransferSaveExportService = (): TransferBatchSaveExportService =>
  createTransferSaveExportService(
    appTransferWriteService,
    resolveAppBrowserDbRuntime,
    createAppDatabaseUploadHandoffService(),
  );
