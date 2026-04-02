// Verifies startup sync-state transitions and toast feedback stay deterministic for UI consumers.
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { DbRuntimeError } from '@db';
import { createSyncStateStore } from '@shared';

import {
  applyStartupDbRuntimeError,
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
      message: 'Suche nach DB-Updates auf OneDrive...',
      branch: null,
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Synchronisiere mit OneDrive im Hintergrund...',
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
      message: 'Neueste DB von OneDrive heruntergeladen.',
      branch: 'online_changed',
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Neueste DB von OneDrive heruntergeladen.',
      'success',
      3200,
    );
  });

  it('applies stale cached fallback decisions and surfaces a warning toast', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Suche nach DB-Updates auf OneDrive...',
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
        message:
          'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
        cause: {
          code: 'network_error',
          status: 503,
        },
      },
    };

    applyStartupFreshnessDecision(store, decision, toastStore);

    expect(get(store)).toEqual({
      state: 'stale',
      message:
        'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again. Nutze vorerst die zwischengespeicherte DB.',
      branch: 'online_metadata_failed_cached',
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again. Nutze vorerst die zwischengespeicherte DB.',
      'warning',
      4200,
    );
  });

  it('applies auth-expired fallback decisions with the cached-db warning message', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Suche nach DB-Updates auf OneDrive...',
    });
    const toastStore = createToastStore();
    const decision: StartupFreshnessDecision = {
      kind: 'ready',
      branch: 'online_auth_expired_cached',
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
        code: 'auth_expired',
        message: 'Your session has expired. Please sign in again to sync with OneDrive.',
        cause: {
          code: 'unauthorized',
          status: 401,
        },
      },
    };

    applyStartupFreshnessDecision(store, decision, toastStore);

    expect(get(store)).toEqual({
      state: 'stale',
      message:
        'Your session has expired. Please sign in again to sync with OneDrive. Nutze vorerst die zwischengespeicherte DB.',
      branch: 'online_auth_expired_cached',
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Your session has expired. Please sign in again to sync with OneDrive. Nutze vorerst die zwischengespeicherte DB.',
      'warning',
      4200,
    );
  });

  it('applies auth-expired terminal decisions as actionable errors', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Suche nach DB-Updates auf OneDrive...',
    });
    const toastStore = createToastStore();
    const decision: StartupFreshnessDecision = {
      kind: 'error',
      branch: 'online_auth_expired',
      syncState: 'error',
      snapshot: null,
      failure: {
        code: 'auth_expired',
        message: 'Your session has expired. Please sign in again to sync with OneDrive.',
        cause: {
          code: 'unauthorized',
          status: 401,
        },
      },
    };

    applyStartupFreshnessDecision(store, decision, toastStore);

    expect(get(store)).toEqual({
      state: 'error',
      message: 'Your session has expired. Please sign in again to sync with OneDrive.',
      branch: 'online_auth_expired',
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Your session has expired. Please sign in again to sync with OneDrive.',
      'error',
      5000,
    );
  });

  it('resets to idle when the startup decision is skipped', () => {
    const store = createSyncStateStore({
      state: 'offline',
      message: 'Offline-Modus nutzt die zuletzt zwischengespeicherte DB.',
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
      progress: null,
    });
    expect(toastStore.show).not.toHaveBeenCalled();
  });

  it('applies unexpected startup errors and surfaces an error toast', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Suche nach DB-Updates auf OneDrive...',
    });
    const toastStore = createToastStore();

    applyUnexpectedStartupSyncError(
      store,
      'Start-Synchronisation unerwartet fehlgeschlagen. Bitte prüfe die Browser-Konsole und versuche es erneut.',
      toastStore,
    );

    expect(get(store)).toEqual({
      state: 'error',
      message: 'Start-Synchronisation unerwartet fehlgeschlagen. Bitte prüfe die Browser-Konsole und versuche es erneut.',
      branch: null,
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Start-Synchronisation unerwartet fehlgeschlagen. Bitte prüfe die Browser-Konsole und versuche es erneut.',
      'error',
      5000,
    );
  });

  it('maps deterministic db runtime open errors into startup sync error state', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Suche nach DB-Updates auf OneDrive...',
    });
    const toastStore = createToastStore();

    applyStartupDbRuntimeError(store, new DbRuntimeError('db_open_failed'), toastStore);

    expect(get(store)).toEqual({
      state: 'error',
      message:
        'Konnte zwischengespeicherte DB nicht öffnen. Synchronisiere erneut über die Einstellungen.',
      branch: 'db_runtime_open_failed',
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Konnte zwischengespeicherte DB nicht öffnen. Synchronisiere erneut über die Einstellungen.',
      'error',
      5000,
    );
  });

  it('falls back to a deterministic generic message for unknown db runtime failures', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Suche nach DB-Updates auf OneDrive...',
    });
    const toastStore = createToastStore();

    applyStartupDbRuntimeError(store, new Error('Unexpected runtime failure'), toastStore);

    expect(get(store)).toEqual({
      state: 'error',
      message: 'Konnte das lokale SQLite-Snapshot nicht öffnen. Wiederhole die Synchronisation in den Einstellungen.',
      branch: 'db_runtime_open_failed',
      progress: null,
    });
    expect(toastStore.show).toHaveBeenCalledWith(
      'Konnte das lokale SQLite-Snapshot nicht öffnen. Wiederhole die Synchronisation in den Einstellungen.',
      'error',
      5000,
    );
  });
});
