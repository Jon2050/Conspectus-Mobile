// Coordinates a committed local transfer write with SQLite byte export for upload handoff.
import {
  appTransferWriteService,
  DbRuntimeError,
  resolveAppBrowserDbRuntime,
  type BrowserDbRuntime,
  type CreateTransferBatchResult,
  type CreateTransferInput,
  type TransferWriteService,
} from '@db';

import {
  appDatabaseSession,
  type DatabaseSession,
  type DatabaseWriteContext,
} from './databaseSession';
import {
  createAppDatabaseUploadHandoffService,
  DatabaseUploadError,
} from './databaseUploadHandoffService';

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
  readonly context?: DatabaseWriteContext;
}

export interface TransferBatchSaveExportService {
  createTransferBatchAndExport(
    inputs: readonly CreateTransferInput[],
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferBatchResult>;
  retryExportedDatabaseUpload(dbBytes: Uint8Array, options?: DatabaseUploadOptions): Promise<void>;
}

export interface PendingTransferBatchUpload {
  readonly batchResult: CreateTransferBatchResult;
  readonly dbBytes: Uint8Array;
  readonly context?: DatabaseWriteContext;
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

type TransferWriteOperations = Pick<TransferWriteService, 'createTransfers'>;

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
  session?: DatabaseSession,
): TransferBatchSaveExportService => {
  const createTransferBatchAndExport = async (
    inputs: readonly CreateTransferInput[],
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferBatchResult> => {
    const context = session?.acquire();
    const uploadOptions =
      context === undefined ? options : { ...options, context, expectedETag: context.baseETag };
    try {
      const batchResult = transferWriteService.createTransfers(inputs);
      session?.markDirty();
      let exportedBytes: Uint8Array;
      try {
        exportedBytes = cloneExportedBytes(resolveTransferExportRuntime(dbRuntime).exportBytes());
      } catch (error) {
        throw new TransferBatchExportRecoveryRequiredError(batchResult, error);
      }
      try {
        uploadOptions?.onUploadStart?.();
        await uploadHandoff.uploadExportedDatabase(exportedBytes, uploadOptions);
      } catch (error) {
        throw new TransferBatchUploadPendingError(
          { batchResult, dbBytes: exportedBytes, ...(context === undefined ? {} : { context }) },
          error,
        );
      }
      return batchResult;
    } finally {
      if (context !== undefined) session?.release();
    }
  };
  return {
    createTransferBatchAndExport,
    async retryExportedDatabaseUpload(dbBytes, options) {
      if (session !== undefined && options?.context === undefined)
        throw new Error('Upload context is required.');
      let context: DatabaseWriteContext | undefined;
      try {
        context = session?.acquire(options?.context);
      } catch (error) {
        throw new DatabaseUploadError(
          'context_changed',
          'The pending database session changed.',
          error,
        );
      }
      try {
        options?.onUploadStart?.();
        await uploadHandoff.uploadExportedDatabase(dbBytes, options);
      } finally {
        if (context !== undefined) session?.release();
      }
    },
  };
};

export const createAppTransferSaveExportService = (): TransferBatchSaveExportService =>
  createTransferSaveExportService(
    appTransferWriteService,
    resolveAppBrowserDbRuntime,
    createAppDatabaseUploadHandoffService(),
    appDatabaseSession,
  );
