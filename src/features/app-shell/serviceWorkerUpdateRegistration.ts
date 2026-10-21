// Checks for updates on registration, foreground/online return, and periodically while active.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

import {
  appServiceWorkerUpdateController,
  type ServiceWorkerUpdateController,
  type ServiceWorkerUpdater,
} from './serviceWorkerUpdateController';
import { activateWaitingServiceWorker } from './serviceWorkerUpdateActivation';

export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

type RegisterServiceWorker = (options?: RegisterSWOptions) => ServiceWorkerUpdater;
type IntervalScheduler = (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;

export interface ServiceWorkerUpdateRegistrationDependencies {
  fetchServiceWorker?: typeof fetch;
  isOnline?: () => boolean;
  scheduleInterval?: IntervalScheduler;
  updateIntervalMs?: number;
  windowTarget?: Pick<Window, 'addEventListener'>;
  documentTarget?: Pick<Document, 'addEventListener' | 'visibilityState'>;
  reloadPage?: () => void;
}

export const checkForServiceWorkerUpdate = async (
  serviceWorkerUrl: string,
  registration: ServiceWorkerRegistration,
  fetchServiceWorker: typeof fetch,
  isOnline: () => boolean,
): Promise<void> => {
  if (registration.installing !== null || !isOnline()) {
    return;
  }

  try {
    const response = await fetchServiceWorker(serviceWorkerUrl, {
      cache: 'no-store',
      headers: {
        cache: 'no-store',
        'cache-control': 'no-cache',
      },
    });

    if (response.status === 200) {
      await registration.update();
    }
  } catch (error) {
    console.warn('Checking for a service worker update failed.', error);
  }
};

export const registerServiceWorkerUpdates = (
  registerServiceWorker: RegisterServiceWorker,
  controller: ServiceWorkerUpdateController = appServiceWorkerUpdateController,
  dependencies: ServiceWorkerUpdateRegistrationDependencies = {},
): void => {
  const fetchServiceWorker = dependencies.fetchServiceWorker ?? globalThis.fetch.bind(globalThis);
  const isOnline = dependencies.isOnline ?? (() => navigator.onLine);
  const scheduleInterval = dependencies.scheduleInterval ?? globalThis.setInterval.bind(globalThis);
  const updateIntervalMs = dependencies.updateIntervalMs ?? SERVICE_WORKER_UPDATE_INTERVAL_MS;
  const windowTarget = dependencies.windowTarget ?? globalThis.window;
  const documentTarget = dependencies.documentTarget ?? globalThis.document;

  registerServiceWorker({
    immediate: true,
    onNeedRefresh: () => {
      controller.notifyUpdateAvailable();
    },
    onRegisteredSW: (serviceWorkerUrl, registration) => {
      if (registration === undefined) {
        return;
      }

      controller.setUpdater(async (_reloadPage, signal) => {
        await activateWaitingServiceWorker(registration, signal);
        if (!signal?.aborted) {
          (dependencies.reloadPage ?? (() => globalThis.location.reload()))();
        }
      });

      // A hard-refreshed page can be uncontrolled. In that case an update may activate
      // immediately, without Workbox ever emitting its waiting/update prompt.
      const activeWorkerAtRegistration = registration.active;
      const observeInstallingWorker = (): void => {
        const installing = registration.installing;
        if (installing === null || activeWorkerAtRegistration === null) return;
        const onStateChange = (): void => {
          if (installing.state === 'activated' || registration.waiting === installing) {
            controller.notifyUpdateAvailable();
          }
          if (installing.state === 'activated' || installing.state === 'redundant') {
            installing.removeEventListener('statechange', onStateChange);
          }
        };
        installing.addEventListener('statechange', onStateChange);
        onStateChange();
      };
      registration.addEventListener('updatefound', observeInstallingWorker);
      observeInstallingWorker();
      if (registration.waiting !== null) controller.notifyUpdateAvailable();

      let checkPending = false;
      const check = async (): Promise<void> => {
        if (checkPending) return;
        checkPending = true;
        try {
          await checkForServiceWorkerUpdate(
            serviceWorkerUrl,
            registration,
            fetchServiceWorker,
            isOnline,
          );
        } finally {
          checkPending = false;
        }
      };
      const requestCheck = (): void => {
        void check();
      };

      requestCheck();
      scheduleInterval(requestCheck, updateIntervalMs);
      windowTarget?.addEventListener('online', requestCheck);
      documentTarget?.addEventListener('visibilitychange', () => {
        if (documentTarget.visibilityState === 'visible') requestCheck();
      });
    },
    onRegisterError: (error) => {
      console.error('Service worker registration failed.', error);
    },
  });
};
