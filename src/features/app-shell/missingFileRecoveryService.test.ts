// Verifies missing-file recovery accepts only an exact same-path replacement item ID.
import { describe, expect, it, vi } from 'vitest';
import type { DriveItemBinding, GraphClient } from '@graph';

import {
  createMissingFileRecoveryService,
  MissingFileRecoveryError,
} from './missingFileRecoveryService';

const BINDING: DriveItemBinding = {
  driveId: 'drive-123',
  itemId: 'old-item-id',
  name: 'conspectus.db',
  parentPath: '/Finance',
};

const createService = (outcome: DriveItemBinding | unknown) => {
  const resolveFileByPath = vi.fn(async () => {
    if (
      outcome instanceof Error ||
      (typeof outcome === 'object' && outcome !== null && 'code' in outcome)
    ) {
      throw outcome;
    }
    return outcome as DriveItemBinding;
  });
  return {
    resolveFileByPath,
    service: createMissingFileRecoveryService({ resolveFileByPath } satisfies Pick<
      GraphClient,
      'resolveFileByPath'
    >),
  };
};

describe('missing file recovery service', () => {
  it('returns an exact same-path replacement with a new item ID', async () => {
    const replacement = { ...BINDING, itemId: 'new-item-id' };
    const { service, resolveFileByPath } = createService(replacement);

    await expect(service.recover(BINDING)).resolves.toEqual(replacement);
    expect(resolveFileByPath).toHaveBeenCalledWith(BINDING);
  });

  it.each([
    { ...BINDING, driveId: 'other-drive', itemId: 'new-item-id' },
    { ...BINDING, parentPath: '/Archive', itemId: 'new-item-id' },
    { ...BINDING, name: 'renamed.db', itemId: 'new-item-id' },
    { ...BINDING },
    { ...BINDING, itemId: '   ' },
  ])('requires an exact unchanged identity boundary for $itemId', async (candidate) => {
    const { service } = createService(candidate);

    await expect(service.recover(BINDING)).rejects.toBeInstanceOf(MissingFileRecoveryError);
  });

  it('maps a definitive path 404 to rebind-required recovery', async () => {
    const { service } = createService({
      code: 'not_found',
      message: 'Missing at path.',
      status: 404,
    });

    await expect(service.recover(BINDING)).rejects.toMatchObject({
      code: 'rebind_required',
    });
  });

  it('maps a folder occupying the saved file path to rebind-required recovery', async () => {
    const { service } = createService({
      code: 'not_found',
      message: 'A folder occupies the saved file path.',
    });

    await expect(service.recover(BINDING)).rejects.toMatchObject({
      code: 'rebind_required',
    });
  });

  it('preserves transient and authentication errors for their existing recovery flows', async () => {
    const networkError = { code: 'network_error', message: 'Temporary outage.', status: 503 };
    const { service } = createService(networkError);

    await expect(service.recover(BINDING)).rejects.toBe(networkError);
  });
});
