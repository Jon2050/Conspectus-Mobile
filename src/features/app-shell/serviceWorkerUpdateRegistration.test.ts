// Verifies service-worker callback wiring and guarded periodic update checks for active clients.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { describe, expect, it, vi } from 'vitest';

import { createServiceWorkerUpdateController } from './serviceWorkerUpdateController';
import {
  checkForServiceWorkerUpdate,
  registerServiceWorkerUpdates,
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
} from './serviceWorkerUpdateRegistration';

const createRegistration = (installing: ServiceWorker | null = null) =>
  ({
    installing,
    update: vi.fn().mockResolvedValue(undefined),
  }) as unknown as ServiceWorkerRegistration;

describe('serviceWorkerUpdateRegistration', () => {
  it('wires prompt and activation callbacks and schedules hourly active-client checks', async () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const updater = vi.fn().mockResolvedValue(undefined);
    const registerServiceWorker = vi.fn((options?: RegisterSWOptions) => {
      capturedOptions = options;
      return updater;
    });
    const controller = createServiceWorkerUpdateController();
    const notifyUpdateAvailable = vi.spyOn(controller, 'notifyUpdateAvailable');
    const scheduleInterval = vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>);

    registerServiceWorkerUpdates(registerServiceWorker, controller, {
      fetchServiceWorker: vi.fn(),
      isOnline: () => true,
      scheduleInterval,
    });

    expect(capturedOptions?.immediate).toBe(true);
    capturedOptions?.onNeedRefresh?.();
    expect(notifyUpdateAvailable).toHaveBeenCalledOnce();

    capturedOptions?.onRegisteredSW?.('/sw.js', createRegistration());
    expect(scheduleInterval).toHaveBeenCalledWith(
      expect.any(Function),
      SERVICE_WORKER_UPDATE_INTERVAL_MS,
    );

    controller.notifyUpdateAvailable();
    await controller.acceptUpdate();
    expect(updater).toHaveBeenCalledWith(true);
  });

  it('does not schedule checks when registration is unavailable', () => {
    let capturedOptions: RegisterSWOptions | undefined;
    const scheduleInterval = vi.fn();

    registerServiceWorkerUpdates(
      (options) => {
        capturedOptions = options;
        return vi.fn();
      },
      createServiceWorkerUpdateController(),
      { scheduleInterval },
    );

    capturedOptions?.onRegisteredSW?.('/sw.js', undefined);
    expect(scheduleInterval).not.toHaveBeenCalled();
  });
});

describe('checkForServiceWorkerUpdate', () => {
  it('bypasses HTTP caches before asking the browser to update the worker', async () => {
    const registration = createRegistration();
    const fetchServiceWorker = vi.fn().mockResolvedValue({ status: 200 });

    await checkForServiceWorkerUpdate('/sw.js', registration, fetchServiceWorker, () => true);

    expect(fetchServiceWorker).toHaveBeenCalledWith('/sw.js', {
      cache: 'no-store',
      headers: {
        cache: 'no-store',
        'cache-control': 'no-cache',
      },
    });
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it.each([
    { name: 'the client is offline', installing: null, online: false },
    { name: 'another worker is installing', installing: {} as ServiceWorker, online: true },
  ])('skips the check when $name', async ({ installing, online }) => {
    const registration = createRegistration(installing);
    const fetchServiceWorker = vi.fn();

    await checkForServiceWorkerUpdate('/sw.js', registration, fetchServiceWorker, () => online);

    expect(fetchServiceWorker).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('ignores unavailable worker responses and transient check failures', async () => {
    const unavailableRegistration = createRegistration();
    await checkForServiceWorkerUpdate(
      '/sw.js',
      unavailableRegistration,
      vi.fn().mockResolvedValue({ status: 503 }),
      () => true,
    );
    expect(unavailableRegistration.update).not.toHaveBeenCalled();

    const failedRegistration = createRegistration();
    await checkForServiceWorkerUpdate(
      '/sw.js',
      failedRegistration,
      vi.fn().mockRejectedValue(new Error('offline')),
      () => true,
    );
    expect(failedRegistration.update).not.toHaveBeenCalled();
  });
});
