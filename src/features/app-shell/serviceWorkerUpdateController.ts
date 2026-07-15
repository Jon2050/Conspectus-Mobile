// Holds the persistent service-worker update prompt state and activates a waiting worker once.
import { writable } from 'svelte/store';

export type ServiceWorkerUpdater = (reloadPage?: boolean) => Promise<void>;
export type ServiceWorkerUpdatePhase = 'idle' | 'available' | 'applying' | 'error';

export interface ServiceWorkerUpdateState {
  phase: ServiceWorkerUpdatePhase;
}

export interface ServiceWorkerUpdateController {
  subscribe: ReturnType<typeof writable<ServiceWorkerUpdateState>>['subscribe'];
  setUpdater(updater: ServiceWorkerUpdater): void;
  notifyUpdateAvailable(): void;
  acceptUpdate(): Promise<void>;
}

const INITIAL_STATE: ServiceWorkerUpdateState = { phase: 'idle' };

export const createServiceWorkerUpdateController = (): ServiceWorkerUpdateController => {
  const { subscribe, set, update } = writable<ServiceWorkerUpdateState>(INITIAL_STATE);
  let updater: ServiceWorkerUpdater | null = null;

  const setUpdater = (nextUpdater: ServiceWorkerUpdater): void => {
    updater = nextUpdater;
  };

  const notifyUpdateAvailable = (): void => {
    set({ phase: 'available' });
  };

  const acceptUpdate = async (): Promise<void> => {
    let shouldApply = false;
    update((state) => {
      shouldApply = state.phase === 'available' || state.phase === 'error';
      return shouldApply ? { phase: 'applying' } : state;
    });

    if (!shouldApply) {
      return;
    }

    if (updater === null) {
      set({ phase: 'error' });
      return;
    }

    try {
      await updater(true);
    } catch (error) {
      console.error('Activating the service worker update failed.', error);
      set({ phase: 'error' });
    }
  };

  return {
    subscribe,
    setUpdater,
    notifyUpdateAvailable,
    acceptUpdate,
  };
};

export const appServiceWorkerUpdateController = createServiceWorkerUpdateController();
