// Connects vite-plugin-pwa registration callbacks to update UI state and periodic active-client checks.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

import {
  appServiceWorkerUpdateController,
  type ServiceWorkerUpdateController,
  type ServiceWorkerUpdater,
} from './serviceWorkerUpdateController';

export const SERVICE_WORKER_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

type RegisterServiceWorker = (options?: RegisterSWOptions) => ServiceWorkerUpdater;
type IntervalScheduler = (callback: () => void, delayMs: number) => ReturnType<typeof setInterval>;

export interface ServiceWorkerUpdateRegistrationDependencies {
  fetchServiceWorker?: typeof fetch;
  isOnline?: () => boolean;
  scheduleInterval?: IntervalScheduler;
  updateIntervalMs?: number;
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

  const updater = registerServiceWorker({
    immediate: true,
    onNeedRefresh: () => {
      controller.notifyUpdateAvailable();
    },
    onRegisteredSW: (serviceWorkerUrl, registration) => {
      if (registration === undefined) {
        return;
      }

      scheduleInterval(() => {
        void checkForServiceWorkerUpdate(
          serviceWorkerUrl,
          registration,
          fetchServiceWorker,
          isOnline,
        );
      }, updateIntervalMs);
    },
    onRegisterError: (error) => {
      console.error('Service worker registration failed.', error);
    },
  });

  controller.setUpdater(updater);
};
