// Holds the app-wide sync state machine so UI surfaces only valid sync-status transitions.
import { writable, type Readable } from 'svelte/store';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'stale' | 'offline' | 'error';

export interface SyncStateSnapshot {
  readonly state: SyncState;
  readonly message: string | null;
  readonly branch: string | null;
}

export interface SyncStateTransitionOptions {
  readonly branch?: string | null;
}

export interface SyncStateStore extends Readable<SyncStateSnapshot> {
  reset: () => void;
  setSyncing: (message: string, options?: SyncStateTransitionOptions) => void;
  setSynced: (message: string, options?: SyncStateTransitionOptions) => void;
  setStale: (message: string, options?: SyncStateTransitionOptions) => void;
  setOffline: (message: string, options?: SyncStateTransitionOptions) => void;
  setError: (message: string, options?: SyncStateTransitionOptions) => void;
}

const DEFAULT_SYNC_STATE_SNAPSHOT: SyncStateSnapshot = {
  state: 'idle',
  message: null,
  branch: null,
};

const ALLOWED_SYNC_STATE_TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  idle: ['syncing', 'offline', 'error'],
  syncing: ['synced', 'stale', 'offline', 'error'],
  synced: ['syncing', 'offline', 'stale', 'error'],
  stale: ['syncing', 'offline', 'error'],
  offline: ['syncing', 'error'],
  error: ['syncing', 'offline'],
};

const createSnapshot = (
  state: SyncState,
  message: string | null,
  options?: SyncStateTransitionOptions,
): SyncStateSnapshot => ({
  state,
  message,
  branch: options?.branch ?? null,
});

const normalizeInitialSnapshot = (
  initialSnapshot: Partial<SyncStateSnapshot> = {},
): SyncStateSnapshot => ({
  state: initialSnapshot.state ?? DEFAULT_SYNC_STATE_SNAPSHOT.state,
  message: initialSnapshot.message ?? DEFAULT_SYNC_STATE_SNAPSHOT.message,
  branch: initialSnapshot.branch ?? DEFAULT_SYNC_STATE_SNAPSHOT.branch,
});

const assertValidTransition = (current: SyncState, next: SyncState): void => {
  if (current === next) {
    return;
  }

  if (ALLOWED_SYNC_STATE_TRANSITIONS[current].includes(next)) {
    return;
  }

  throw new Error(`Illegal sync state transition: ${current} -> ${next}`);
};

export const createSyncStateStore = (
  initialSnapshot: Partial<SyncStateSnapshot> = {},
): SyncStateStore => {
  const { subscribe, set, update } = writable<SyncStateSnapshot>(
    normalizeInitialSnapshot(initialSnapshot),
  );

  const transitionTo = (
    nextState: SyncState,
    message: string,
    options?: SyncStateTransitionOptions,
  ): void => {
    update((currentSnapshot) => {
      assertValidTransition(currentSnapshot.state, nextState);
      return createSnapshot(nextState, message, options);
    });
  };

  return {
    subscribe,
    reset: () => set(DEFAULT_SYNC_STATE_SNAPSHOT),
    setSyncing: (message, options) => transitionTo('syncing', message, options),
    setSynced: (message, options) => transitionTo('synced', message, options),
    setStale: (message, options) => transitionTo('stale', message, options),
    setOffline: (message, options) => transitionTo('offline', message, options),
    setError: (message, options) => transitionTo('error', message, options),
  };
};

export const appSyncStateStore = createSyncStateStore();
