// Coordinates a committed local transfer write with SQLite byte export for upload handoff.
import {
  DbRuntimeError,
  type BrowserDbRuntime,
  type CreateTransferInput,
  type CreateTransferResult,
  type TransferWriteService,
} from '@db';

export interface DatabaseUploadHandoff {
  uploadExportedDatabase(dbBytes: Uint8Array): Promise<void>;
}

export interface TransferSaveExportService {
  createTransferAndExport(input: CreateTransferInput): Promise<CreateTransferResult>;
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
  async createTransferAndExport(input: CreateTransferInput): Promise<CreateTransferResult> {
    const transferResult = transferWriteService.createTransfer(input);
    const exportedBytes = cloneExportedBytes(resolveTransferExportRuntime(dbRuntime).exportBytes());

    await uploadHandoff.uploadExportedDatabase(exportedBytes);

    return transferResult;
  },
});
