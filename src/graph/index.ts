export interface DriveItemBinding {
  readonly driveId: string;
  readonly itemId: string;
  readonly name: string;
  readonly parentPath: string;
}

export interface GraphFileMetadata {
  readonly eTag: string;
  readonly sizeBytes: number;
  readonly lastModifiedDateTime: string;
}

export interface GraphUploadResult {
  readonly eTag: string;
  readonly sizeBytes: number;
  readonly lastModifiedDateTime: string;
}

export type GraphErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'network_error'
  | 'unknown';

export interface GraphError {
  readonly code: GraphErrorCode;
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
}

export interface GraphClient {
  getFileMetadata(binding: DriveItemBinding): Promise<GraphFileMetadata>;
  downloadFile(binding: DriveItemBinding): Promise<Uint8Array>;
  uploadFile(
    binding: DriveItemBinding,
    bytes: Uint8Array,
    expectedETag: string,
  ): Promise<GraphUploadResult>;
}

export { createGraphClient } from './graphClient';
