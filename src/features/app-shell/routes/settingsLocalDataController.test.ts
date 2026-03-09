// Verifies confirmation and execution behavior for the destructive local app data reset controller.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSettingsLocalDataController } from './settingsLocalDataController';

const createDeferred = <T>(): { promise: Promise<T>; resolve(value: T): void } => {
  let resolvePromise: (value: T) => void = () => {};

  return {
    promise: new Promise<T>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: (value: T) => {
      resolvePromise(value);
    },
  };
};

describe('settings local data controller', () => {
  let clearAll: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let onLocalDataReset: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    clearAll = vi.fn<() => Promise<void>>(async () => {});
    onLocalDataReset = vi.fn<() => void>();
  });

  it('does not clear cache or binding when confirmation is canceled', () => {
    const controller = createSettingsLocalDataController({ clearAll }, { onLocalDataReset });

    controller.requestReset();
    expect(controller.getState()).toEqual({
      operation: 'confirming',
      error: null,
    });

    controller.cancelReset();
    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
    });
    expect(clearAll).not.toHaveBeenCalled();
    expect(onLocalDataReset).not.toHaveBeenCalled();
  });

  it('clears cache and local binding when reset is confirmed', async () => {
    const deferred = createDeferred<void>();
    clearAll.mockImplementationOnce(async () => {
      await deferred.promise;
    });
    const controller = createSettingsLocalDataController({ clearAll }, { onLocalDataReset });

    controller.requestReset();

    const confirmPromise = controller.confirmReset();
    expect(controller.getState()).toEqual({
      operation: 'resetting',
      error: null,
    });

    deferred.resolve();
    await confirmPromise;

    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(onLocalDataReset).toHaveBeenCalledTimes(1);
    const clearCallOrder = clearAll.mock.invocationCallOrder[0];
    const resetCallOrder = onLocalDataReset.mock.invocationCallOrder[0];
    expect(clearCallOrder).toBeDefined();
    expect(resetCallOrder).toBeDefined();
    expect(clearCallOrder ?? 0).toBeLessThan(resetCallOrder ?? 0);
    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
    });
  });

  it('keeps local binding untouched when cache clear fails', async () => {
    clearAll.mockRejectedValueOnce(new Error('Mock cache clear failure.'));
    const controller = createSettingsLocalDataController({ clearAll }, { onLocalDataReset });
    controller.requestReset();

    await controller.confirmReset();

    expect(onLocalDataReset).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      operation: 'confirming',
      error: {
        message: 'Mock cache clear failure.',
        cause: expect.any(Error),
      },
    });
  });
});
