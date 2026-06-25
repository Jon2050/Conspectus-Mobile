// Coordinates a committed local transfer write with SQLite byte export for upload handoff.
import {
  appTransferWriteService,
  DbRuntimeError,
  resolveAppBrowserDbRuntime,
  type BrowserDbRuntime,
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
}

export interface TransferSaveExportService {
  createTransferAndExport(
    input: CreateTransferInput,
    options?: DatabaseUploadOptions,
  ): Promise<CreateTransferResult>;
  retryExportedDatabaseUpload(dbBytes: Uint8Array, options?: DatabaseUploadOptions): Promise<void>;
}

export interface PendingTransferUpload {
  readonly transferResult: CreateTransferResult;
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
  transferWriteService: Pick<TransferWriteService, 'createTransfer'>,
  dbRuntime: TransferExportRuntimeProvider,
  uploadHandoff: DatabaseUploadHandoff,
): TransferSaveExportService => ({
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

  async retryExportedDatabaseUpload(
    dbBytes: Uint8Array,
    options?: DatabaseUploadOptions,
  ): Promise<void> {
    options?.onUploadStart?.();
    await uploadHandoff.uploadExportedDatabase(dbBytes, options);
  },
});

export const createAppTransferSaveExportService = (): TransferSaveExportService =>
  createTransferSaveExportService(
    appTransferWriteService,
    resolveAppBrowserDbRuntime,
    createAppDatabaseUploadHandoffService(),
  );
