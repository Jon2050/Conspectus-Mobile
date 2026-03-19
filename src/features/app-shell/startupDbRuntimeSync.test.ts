// Verifies startup DB runtime syncing ignores superseded operations and closes runtime on non-ready decisions.
import { describe, expect, it, vi } from 'vitest';
import type { BrowserDbRuntime } from '@db';

import { syncDbRuntimeForStartupDecision } from './startupDbRuntimeSync';
import type { StartupFreshnessDecision } from './startupFreshnessService';

const createDbRuntimeMock = (): Pick<BrowserDbRuntime, 'open' | 'close'> => ({
  open: vi.fn(async () => {}),
  close: vi.fn(() => {}),
});

const createReadyDecision = (): StartupFreshnessDecision => ({
  kind: 'ready',
  branch: 'online_unchanged',
  syncState: 'synced',
  snapshot: {
    binding: {
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    },
    metadata: {
      eTag: '"etag-1"',
      lastSyncAtIso: '2026-03-11T09:45:00.000Z',
    },
    dbBytes: Uint8Array.from([
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33,
      0x00, 1, 2, 3,
    ]),
  },
  failure: null,
});

describe('startup db runtime sync', () => {
  it('closes the runtime for non-ready startup decisions', async () => {
    const dbRuntime = createDbRuntimeMock();
    const decision: StartupFreshnessDecision = {
      kind: 'error',
      branch: 'online_metadata_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'metadata_fetch_failed',
        message: 'Metadata failed',
        cause: new Error('Metadata failed'),
      },
    };

    await expect(syncDbRuntimeForStartupDecision(dbRuntime, decision, () => true)).resolves.toBe(
      'applied',
    );

    expect(dbRuntime.close).toHaveBeenCalledTimes(1);
    expect(dbRuntime.open).not.toHaveBeenCalled();
  });

  it('does not close the runtime when a non-ready decision is already superseded', async () => {
    const dbRuntime = createDbRuntimeMock();
    const decision: StartupFreshnessDecision = {
      kind: 'error',
      branch: 'online_metadata_failed',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'metadata_fetch_failed',
        message: 'Metadata failed',
        cause: new Error('Metadata failed'),
      },
    };

    await expect(syncDbRuntimeForStartupDecision(dbRuntime, decision, () => false)).resolves.toBe(
      'superseded',
    );

    expect(dbRuntime.close).not.toHaveBeenCalled();
    expect(dbRuntime.open).not.toHaveBeenCalled();
  });

  it('skips DB open when a startup operation was superseded before runtime application', async () => {
    const dbRuntime = createDbRuntimeMock();
    const decision = createReadyDecision();

    await expect(syncDbRuntimeForStartupDecision(dbRuntime, decision, () => false)).resolves.toBe(
      'superseded',
    );

    expect(dbRuntime.open).not.toHaveBeenCalled();
    expect(dbRuntime.close).not.toHaveBeenCalled();
  });

  it('passes the supersession guard into runtime open calls and returns superseded when it flips', async () => {
    const dbRuntime = createDbRuntimeMock();
    const decision = createReadyDecision();
    let operationIsCurrent = true;

    dbRuntime.open = vi.fn(async (_snapshotBytes, options) => {
      expect(options?.canApply?.()).toBe(true);
      operationIsCurrent = false;
    });

    await expect(
      syncDbRuntimeForStartupDecision(dbRuntime, decision, () => operationIsCurrent),
    ).resolves.toBe('superseded');

    expect(dbRuntime.open).toHaveBeenCalledTimes(1);
  });
});
