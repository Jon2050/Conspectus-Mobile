import { writable, type Readable } from 'svelte/store';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'stale' | 'offline' | 'error';

export interface SyncStateStore extends Readable<SyncState> {
  setIdle: () => void;
  setSyncing: () => void;
  setSynced: () => void;
  setStale: () => void;
  setOffline: () => void;
  setError: () => void;
}

export const createSyncStateStore = (initialState: SyncState = 'idle'): SyncStateStore => {
  const { subscribe, set } = writable<SyncState>(initialState);

  return {
    subscribe,
    setIdle: () => set('idle'),
    setSyncing: () => set('syncing'),
    setSynced: () => set('synced'),
    setStale: () => set('stale'),
    setOffline: () => set('offline'),
    setError: () => set('error'),
  };
};
