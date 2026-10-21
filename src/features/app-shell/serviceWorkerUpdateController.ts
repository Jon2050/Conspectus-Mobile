// Holds the persistent service-worker update prompt state and activates a waiting worker once.
import { writable } from 'svelte/store';

const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 15_000;
export type ServiceWorkerUpdater = (reloadPage?: boolean, signal?: AbortSignal) => Promise<void>;
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

export const createServiceWorkerUpdateController = (
  timeoutMs = SERVICE_WORKER_ACTIVATION_TIMEOUT_MS,
): ServiceWorkerUpdateController => {
  const { subscribe, set, update } = writable<ServiceWorkerUpdateState>(INITIAL_STATE);
  let updater: ServiceWorkerUpdater | null = null;
  let attemptId = 0;

  const setUpdater = (nextUpdater: ServiceWorkerUpdater): void => {
    updater = nextUpdater;
  };

  const notifyUpdateAvailable = (): void => {
    update((state) => (state.phase === 'applying' ? state : { phase: 'available' }));
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

    const currentAttemptId = ++attemptId;
    const abortController = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const navigationDeadline = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        if (attemptId === currentAttemptId) {
          abortController.abort();
          set({ phase: 'error' });
        }
        resolve();
      }, timeoutMs);
    });

    try {
      await Promise.race([updater(true, abortController.signal), navigationDeadline]);
      // Keep the watchdog armed until navigation destroys this page. A resolved updater alone
      // does not prove that a browser actually reloaded (the previous implementation hung here).
    } catch (error) {
      clearTimeout(timeout!);
      console.error('Activating the service worker update failed.', error);
      if (attemptId === currentAttemptId) set({ phase: 'error' });
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
