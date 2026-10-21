// Verifies service-worker callback wiring and guarded periodic update checks for active clients.
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServiceWorkerUpdateController } from './serviceWorkerUpdateController';
import {
  checkForServiceWorkerUpdate,
  registerServiceWorkerUpdates,
  SERVICE_WORKER_UPDATE_INTERVAL_MS,
} from './serviceWorkerUpdateRegistration';

const createRegistration = (installing: ServiceWorker | null = null) =>
  Object.assign(new EventTarget(), {
    installing,
    waiting: null,
    active: { state: 'activated' },
    update: vi.fn().mockResolvedValue(undefined),
  }) as unknown as ServiceWorkerRegistration;

describe('serviceWorkerUpdateRegistration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
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
    const reloadPage = vi.fn();

    registerServiceWorkerUpdates(registerServiceWorker, controller, {
      fetchServiceWorker: vi.fn().mockResolvedValue({ status: 200 }),
      isOnline: () => true,
      scheduleInterval,
      reloadPage,
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
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(updater).not.toHaveBeenCalled();
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

  it('offers an update that activates without a waiting event on an uncontrolled page', () => {
    const registration = createRegistration();
    const controller = createServiceWorkerUpdateController();
    const notifyUpdateAvailable = vi.spyOn(controller, 'notifyUpdateAvailable');
    let options: RegisterSWOptions | undefined;
    registerServiceWorkerUpdates(
      (captured) => {
        options = captured;
        return vi.fn();
      },
      controller,
      {
        fetchServiceWorker: vi.fn().mockResolvedValue({ status: 200 }),
        isOnline: () => true,
        scheduleInterval: vi.fn(),
      },
    );
    options?.onRegisteredSW?.('/sw.js', registration);
    const worker = Object.assign(new EventTarget(), { state: 'installing' as ServiceWorkerState });
    Object.defineProperty(registration, 'installing', { value: worker });
    registration.dispatchEvent(new Event('updatefound'));
    expect(notifyUpdateAvailable).not.toHaveBeenCalled();
    worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    expect(notifyUpdateAvailable).toHaveBeenCalledOnce();
  });

  it('checks immediately and on visible/online return without overlapping requests', async () => {
    const windowTarget = new EventTarget();
    const documentTarget = Object.assign(new EventTarget(), {
      visibilityState: 'hidden' as DocumentVisibilityState,
    });
    const registration = createRegistration();
    let finishFetch: (response: { status: number }) => void = () => {};
    const fetchServiceWorker = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    let capturedOptions: RegisterSWOptions | undefined;
    registerServiceWorkerUpdates(
      (options) => {
        capturedOptions = options;
        return vi.fn();
      },
      createServiceWorkerUpdateController(),
      {
        fetchServiceWorker,
        isOnline: () => true,
        scheduleInterval: vi.fn(),
        windowTarget,
        documentTarget,
      },
    );

    capturedOptions?.onRegisteredSW?.('/sw.js', registration);
    expect(fetchServiceWorker).toHaveBeenCalledOnce();
    windowTarget.dispatchEvent(new Event('online'));
    expect(fetchServiceWorker).toHaveBeenCalledOnce();
    finishFetch({ status: 200 });
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledOnce());

    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(fetchServiceWorker).toHaveBeenCalledOnce();
    documentTarget.visibilityState = 'visible';
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(fetchServiceWorker).toHaveBeenCalledTimes(2);
    finishFetch({ status: 200 });
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(2));

    windowTarget.dispatchEvent(new Event('online'));
    expect(fetchServiceWorker).toHaveBeenCalledTimes(3);
    finishFetch({ status: 200 });
    await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(3));
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
