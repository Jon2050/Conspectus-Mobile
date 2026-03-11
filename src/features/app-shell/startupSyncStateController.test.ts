// Verifies startup sync-state transitions and toast feedback stay deterministic for UI consumers.
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { createSyncStateStore } from '@shared';

import {
  applyStartupFreshnessDecision,
  applyUnexpectedStartupSyncError,
  beginStartupSync,
} from './startupSyncStateController';

import type { StartupFreshnessDecision } from './startupFreshnessService';

const createToastStore = () => ({
  show: vi.fn(() => 'toast-id'),
});

describe('startupSyncStateController', () => {
  it('enters syncing state and shows an info toast when startup sync begins', () => {
    const store = createSyncStateStore();
    const toastStore = createToastStore();

    beginStartupSync(store, toastStore);

    expect(get(store)).toEqual({
      state: 'syncing',
      message: 'Checking OneDrive for DB updates...',
      branch: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Syncing with OneDrive in the background...',
      'info',
      2800,
    );
  });

  it('applies a successful online change decision and surfaces a success toast', () => {
    const store = createSyncStateStore();
    const toastStore = createToastStore();
    const decision: StartupFreshnessDecision = {
      kind: 'ready',
      branch: 'online_changed',
      syncState: 'synced',
      snapshot: {
        binding: {
          driveId: 'drive-123',
          itemId: 'item-456',
          name: 'conspectus.db',
          parentPath: '/',
        },
        metadata: {
          eTag: '"etag-2"',
          lastSyncAtIso: '2026-03-11T10:45:00.000Z',
        },
        dbBytes: Uint8Array.from([1, 2, 3, 4]),
      },
      failure: null,
    };

    beginStartupSync(store, toastStore);
    toastStore.show.mockClear();

    applyStartupFreshnessDecision(store, decision, toastStore);

    expect(get(store)).toEqual({
      state: 'synced',
      message: 'Downloaded the latest DB from OneDrive.',
      branch: 'online_changed',
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Downloaded the latest DB from OneDrive.',
      'success',
      3200,
    );
  });

  it('applies stale cached fallback decisions and surfaces a warning toast', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Checking OneDrive for DB updates...',
    });
    const toastStore = createToastStore();
    const decision: StartupFreshnessDecision = {
      kind: 'ready',
      branch: 'online_metadata_failed_cached',
      syncState: 'stale',
      snapshot: {
        binding: {
          driveId: 'drive-123',
          itemId: 'item-456',
          name: 'conspectus.db',
          parentPath: '/',
        },
        metadata: {
          eTag: '"etag-1"',
          lastSyncAtIso: '2026-03-11T09:45:00.000Z',
        },
        dbBytes: Uint8Array.from([1, 2, 3, 4]),
      },
      failure: {
        code: 'metadata_fetch_failed',
        message: 'Graph metadata request failed.',
        cause: new Error('Graph metadata request failed.'),
      },
    };

    applyStartupFreshnessDecision(store, decision, toastStore);

    expect(get(store)).toEqual({
      state: 'stale',
      message: 'Using cached DB because the OneDrive freshness check failed.',
      branch: 'online_metadata_failed_cached',
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Using cached DB because the OneDrive freshness check failed.',
      'warning',
      4200,
    );
  });

  it('resets to idle when the startup decision is skipped', () => {
    const store = createSyncStateStore({
      state: 'offline',
      message: 'Offline mode using the last cached DB.',
      branch: 'offline_cached',
    });
    const toastStore = createToastStore();
    const decision: StartupFreshnessDecision = {
      kind: 'skipped',
      branch: 'no_binding',
      syncState: 'idle',
      snapshot: null,
      failure: null,
    };

    applyStartupFreshnessDecision(store, decision, toastStore);

    expect(get(store)).toEqual({
      state: 'idle',
      message: null,
      branch: null,
    });
    expect(toastStore.show).not.toHaveBeenCalled();
  });

  it('applies unexpected startup errors and surfaces an error toast', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Checking OneDrive for DB updates...',
    });
    const toastStore = createToastStore();

    applyUnexpectedStartupSyncError(
      store,
      'Startup sync failed unexpectedly. Check the browser console and retry.',
      toastStore,
    );

    expect(get(store)).toEqual({
      state: 'error',
      message: 'Startup sync failed unexpectedly. Check the browser console and retry.',
      branch: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Startup sync failed unexpectedly. Check the browser console and retry.',
      'error',
      5000,
    );
  });
});
