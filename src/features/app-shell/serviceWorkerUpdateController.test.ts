// Verifies update notifications remain actionable and service-worker activation is single-flight.
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

import { createServiceWorkerUpdateController } from './serviceWorkerUpdateController';

describe('serviceWorkerUpdateController', () => {
  it('starts idle and exposes a new update persistently', () => {
    const controller = createServiceWorkerUpdateController();

    expect(get(controller)).toEqual({ phase: 'idle' });

    controller.notifyUpdateAvailable();

    expect(get(controller)).toEqual({ phase: 'available' });
  });

  it('activates the waiting worker once while an update is applying', async () => {
    let finishUpdate: (() => void) | undefined;
    const updater = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishUpdate = resolve;
        }),
    );
    const controller = createServiceWorkerUpdateController();
    controller.setUpdater(updater);
    controller.notifyUpdateAvailable();

    const firstAttempt = controller.acceptUpdate();
    const duplicateAttempt = controller.acceptUpdate();

    expect(get(controller)).toEqual({ phase: 'applying' });
    expect(updater).toHaveBeenCalledTimes(1);
    expect(updater).toHaveBeenCalledWith(true);

    finishUpdate?.();
    await Promise.all([firstAttempt, duplicateAttempt]);
    expect(get(controller)).toEqual({ phase: 'applying' });
  });

  it('keeps a failed activation visible and retryable', async () => {
    const updater = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('activation failed'))
      .mockResolvedValueOnce();
    const controller = createServiceWorkerUpdateController();
    controller.setUpdater(updater);
    controller.notifyUpdateAvailable();

    await controller.acceptUpdate();
    expect(get(controller)).toEqual({ phase: 'error' });

    await controller.acceptUpdate();
    expect(updater).toHaveBeenCalledTimes(2);
    expect(get(controller)).toEqual({ phase: 'applying' });
  });

  it('keeps the prompt retryable when activation is requested before setup completes', async () => {
    const controller = createServiceWorkerUpdateController();
    controller.notifyUpdateAvailable();

    await controller.acceptUpdate();

    expect(get(controller)).toEqual({ phase: 'error' });
  });
});
