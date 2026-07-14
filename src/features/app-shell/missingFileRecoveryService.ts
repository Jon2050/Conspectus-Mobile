// Resolves a replacement OneDrive item ID only when the saved drive, path, and file name are unchanged.
import type { DriveItemBinding, GraphClient, GraphError } from '@graph';

export type MissingFileRecoveryErrorCode = 'rebind_required';

export class MissingFileRecoveryError extends Error {
  readonly code: MissingFileRecoveryErrorCode;
  override readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'MissingFileRecoveryError';
    this.code = 'rebind_required';
    this.cause = cause;
  }
}

export interface MissingFileRecoveryService {
  recover(binding: DriveItemBinding): Promise<DriveItemBinding>;
}

const isGraphError = (error: unknown): error is GraphError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as Partial<GraphError>).code === 'string' &&
  typeof (error as Partial<GraphError>).message === 'string';

const isExactReplacement = (
  currentBinding: DriveItemBinding,
  candidateBinding: DriveItemBinding,
): boolean =>
  candidateBinding.driveId === currentBinding.driveId &&
  candidateBinding.parentPath === currentBinding.parentPath &&
  candidateBinding.name === currentBinding.name &&
  candidateBinding.itemId.trim().length > 0 &&
  candidateBinding.itemId !== currentBinding.itemId;

export const isMissingFileRecoveryError = (error: unknown): error is MissingFileRecoveryError =>
  error instanceof MissingFileRecoveryError ||
  (typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'rebind_required');

export const createMissingFileRecoveryService = (
  graphClient: Pick<GraphClient, 'resolveFileByPath'>,
): MissingFileRecoveryService => ({
  async recover(binding): Promise<DriveItemBinding> {
    let candidateBinding: DriveItemBinding;

    try {
      candidateBinding = await graphClient.resolveFileByPath(binding);
    } catch (error) {
      if (isGraphError(error) && error.code === 'not_found') {
        throw new MissingFileRecoveryError(
          'The selected OneDrive file no longer exists at its saved path.',
          error,
        );
      }

      throw error;
    }

    if (!isExactReplacement(binding, candidateBinding)) {
      throw new MissingFileRecoveryError(
        'The OneDrive path lookup did not return the exact saved database file with a replacement item ID.',
        candidateBinding,
      );
    }

    return candidateBinding;
  },
});
