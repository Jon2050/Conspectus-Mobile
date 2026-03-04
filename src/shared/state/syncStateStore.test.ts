import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createSyncStateStore, type SyncState } from './syncStateStore';

describe('createSyncStateStore', () => {
  it('starts in idle state by default', () => {
    const store = createSyncStateStore();
    expect(get(store)).toBe('idle');
  });

  it('supports sync lifecycle transitions', () => {
    const store = createSyncStateStore('syncing');

    store.setSynced();
    expect(get(store)).toBe('synced');

    store.setError();
    expect(get(store)).toBe('error');

    store.setIdle();
    expect(get(store)).toBe('idle');
  });

  it('supports stale and offline transitions', () => {
    const store = createSyncStateStore();

    store.setStale();
    expect(get(store)).toBe('stale');

    store.setOffline();
    expect(get(store)).toBe('offline');

    store.setSyncing();
    expect(get(store)).toBe('syncing');
  });

  it.each<SyncState>(['idle', 'syncing', 'synced', 'stale', 'offline', 'error'])(
    'can be initialized with state "%s"',
    (state) => {
      const store = createSyncStateStore(state);
      expect(get(store)).toBe(state);
    },
  );

  it('notifies subscribers on each state transition', () => {
    const store = createSyncStateStore('idle');
    const observed: SyncState[] = [];

    const unsubscribe = store.subscribe((value) => {
      observed.push(value);
    });

    store.setSyncing();
    store.setSynced();
    store.setError();

    unsubscribe();

    expect(observed).toEqual(['idle', 'syncing', 'synced', 'error']);
  });
});
