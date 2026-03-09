// Defines the public Microsoft Graph types and client contract used by app features.
export interface DriveItemBinding {
  readonly driveId: string;
  readonly itemId: string;
  readonly name: string;
  readonly parentPath: string;
}

export interface DriveFolderReference {
  readonly driveId: string;
  readonly itemId: string;
  readonly path: string;
}

export type GraphDriveItemKind = 'file' | 'folder';

export interface GraphDriveItem {
  readonly driveId: string;
  readonly itemId: string;
  readonly name: string;
  readonly parentPath: string;
  readonly kind: GraphDriveItemKind;
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
  listChildren(folder?: DriveFolderReference): Promise<readonly GraphDriveItem[]>;
  getFileMetadata(binding: DriveItemBinding): Promise<GraphFileMetadata>;
  downloadFile(binding: DriveItemBinding): Promise<Uint8Array>;
  uploadFile(
    binding: DriveItemBinding,
    bytes: Uint8Array,
    expectedETag: string,
  ): Promise<GraphUploadResult>;
}

export { createGraphClient } from './graphClient';
