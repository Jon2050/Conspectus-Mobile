// Verifies update notifications remain actionable and service-worker activation is single-flight.
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServiceWorkerUpdateController } from './serviceWorkerUpdateController';

describe('serviceWorkerUpdateController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
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
    expect(updater).toHaveBeenCalledWith(true, expect.any(AbortSignal));

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

  it.each([true, false])(
    'times out and allows retry when navigation never happens (updater pending: %s)',
    async (pending) => {
      const updater = vi
        .fn()
        .mockImplementation(() => (pending ? new Promise<void>(() => {}) : Promise.resolve()));
      const controller = createServiceWorkerUpdateController(100);
      controller.setUpdater(updater);
      controller.notifyUpdateAvailable();
      const firstAttempt = controller.acceptUpdate();
      const signal = updater.mock.calls[0]![1] as AbortSignal;
      controller.notifyUpdateAvailable();
      expect(get(controller).phase).toBe('applying');
      await vi.advanceTimersByTimeAsync(100);
      await firstAttempt;
      expect(signal.aborted).toBe(true);
      expect(get(controller).phase).toBe('error');
      const retry = controller.acceptUpdate();
      expect(updater).toHaveBeenCalledTimes(2);
      expect(get(controller).phase).toBe('applying');
      await vi.advanceTimersByTimeAsync(100);
      await retry;
    },
  );
});
