// Covers activation without an existing controller, stale prompts, failures, and cancellation.
import { describe, expect, it, vi } from 'vitest';
import { activateWaitingServiceWorker } from './serviceWorkerUpdateActivation';

const createWorker = () =>
  Object.assign(new EventTarget(), {
    state: 'installed' as ServiceWorkerState,
    postMessage: vi.fn(),
  });
const registrationWith = (waiting: ReturnType<typeof createWorker> | null, active = true) =>
  ({
    waiting,
    active: active ? { state: 'activated' } : null,
  }) as unknown as ServiceWorkerRegistration;

describe('activateWaitingServiceWorker', () => {
  it('waits for actual activation without depending on controllerchange or Workbox isUpdate', async () => {
    const worker = createWorker();
    let completed = false;
    const activation = activateWaitingServiceWorker(registrationWith(worker)).then(() => {
      completed = true;
    });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    worker.state = 'activating';
    worker.dispatchEvent(new Event('statechange'));
    await Promise.resolve();
    expect(completed).toBe(false);
    worker.state = 'activated';
    worker.dispatchEvent(new Event('statechange'));
    await activation;
    expect(completed).toBe(true);
  });

  it('allows reloading when another tab already activated the worker', async () => {
    await expect(activateWaitingServiceWorker(registrationWith(null))).resolves.toBeUndefined();
    await expect(activateWaitingServiceWorker(registrationWith(null, false))).rejects.toThrow(
      'No active or waiting',
    );
  });

  it('rejects and detaches listeners when the activation deadline aborts the attempt', async () => {
    const worker = createWorker();
    const removeListener = vi.spyOn(worker, 'removeEventListener');
    const abort = new AbortController();
    const activation = activateWaitingServiceWorker(registrationWith(worker), abort.signal);
    abort.abort();
    await expect(activation).rejects.toThrow('timed out');
    expect(removeListener).toHaveBeenCalledWith('statechange', expect.any(Function));
  });

  it('rejects a superseded worker and message delivery failures', async () => {
    const worker = createWorker();
    const activation = activateWaitingServiceWorker(registrationWith(worker));
    worker.state = 'redundant';
    worker.dispatchEvent(new Event('statechange'));
    await expect(activation).rejects.toThrow('superseded');
    worker.postMessage.mockImplementation(() => {
      throw new Error('message failed');
    });
    await expect(activateWaitingServiceWorker(registrationWith(worker))).rejects.toThrow(
      'message failed',
    );
  });
});
