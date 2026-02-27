import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { createSyncStateStore } from './syncStateStore';

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
});
