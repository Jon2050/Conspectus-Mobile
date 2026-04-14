import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createSyncStateStore, type SyncState, type SyncStateSnapshot } from './syncStateStore';

describe('createSyncStateStore', () => {
  it('starts in idle state by default', () => {
    const store = createSyncStateStore();
    expect(get(store)).toEqual<SyncStateSnapshot>({
      state: 'idle',
      message: null,
      branch: null,
      progress: null,
    });
  });

  it('supports valid sync lifecycle transitions', () => {
    const store = createSyncStateStore({
      state: 'syncing',
      message: 'Checking OneDrive for DB updates...',
    });

    store.setSynced('Cached DB is current with OneDrive.', {
      branch: 'online_unchanged',
    });
    expect(get(store)).toEqual<SyncStateSnapshot>({
      state: 'synced',
      message: 'Cached DB is current with OneDrive.',
      branch: 'online_unchanged',
      progress: null,
    });

    store.setOffline('Offline mode using the last cached DB.', {
      branch: 'offline_cached',
    });
    expect(get(store)).toEqual<SyncStateSnapshot>({
      state: 'offline',
      message: 'Offline mode using the last cached DB.',
      branch: 'offline_cached',
      progress: null,
    });

    store.reset();
    expect(get(store)).toEqual<SyncStateSnapshot>({
      state: 'idle',
      message: null,
      branch: null,
      progress: null,
    });
  });

  it('rejects illegal transitions and keeps the previous state', () => {
    const store = createSyncStateStore();

    expect(() => {
      store.setSynced('Cached DB is current with OneDrive.');
    }).toThrowError('Illegal sync state transition: idle -> synced');

    expect(get(store)).toEqual<SyncStateSnapshot>({
      state: 'idle',
      message: null,
      branch: null,
      progress: null,
    });
  });

  it.each<SyncState>(['idle', 'syncing', 'synced', 'stale', 'offline', 'error'])(
    'can be initialized with state "%s"',
    (state) => {
      const store = createSyncStateStore({
        state,
        message: `${state} message`,
        branch: `${state}-branch`,
        progress: null,
      });
      expect(get(store)).toEqual<SyncStateSnapshot>({
        state,
        message: `${state} message`,
        branch: `${state}-branch`,
        progress: null,
      });
    },
  );

  it('notifies subscribers on each state transition', () => {
    const store = createSyncStateStore();
    const observed: SyncStateSnapshot[] = [];

    const unsubscribe = store.subscribe((value) => {
      observed.push(value);
    });

    store.setSyncing('Checking OneDrive for DB updates...');
    store.setSynced('Downloaded the latest DB from OneDrive.', {
      branch: 'online_changed',
    });
    store.setError('Startup sync failed unexpectedly.');

    unsubscribe();

    expect(observed).toEqual<SyncStateSnapshot[]>([
      {
        state: 'idle',
        message: null,
        branch: null,
        progress: null,
      },
      {
        state: 'syncing',
        message: 'Checking OneDrive for DB updates...',
        branch: null,
        progress: null,
      },
      {
        state: 'synced',
        message: 'Downloaded the latest DB from OneDrive.',
        branch: 'online_changed',
        progress: null,
      },
      {
        state: 'error',
        message: 'Startup sync failed unexpectedly.',
        branch: null,
        progress: null,
      },
    ]);
  });

  it('only updates progress when in syncing state', () => {
    const store = createSyncStateStore();

    store.updateProgress(10, 100);
    expect(get(store).progress).toBeNull();

    store.setSyncing('Syncing...');
    store.updateProgress(10, 100);
    expect(get(store).progress).toEqual({ loaded: 10, total: 100, kind: 'download' });

    store.updateProgress(20, 100, 'upload');
    expect(get(store).progress).toEqual({ loaded: 20, total: 100, kind: 'upload' });

    store.setSynced('Done');
    store.updateProgress(20, 100);
    expect(get(store).progress).toBeNull();
  });
});
