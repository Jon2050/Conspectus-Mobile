// Confirms activation directly, including pages that bypassed their worker during a hard refresh.
export const activateWaitingServiceWorker = (
  registration: ServiceWorkerRegistration,
  signal?: AbortSignal,
): Promise<void> => {
  if (signal?.aborted) return Promise.reject(new Error('App update was cancelled.'));
  const waiting = registration.waiting;
  if (waiting === null) {
    // Another tab may already have activated the worker after this tab displayed its prompt.
    return registration.active === null
      ? Promise.reject(new Error('No active or waiting app service worker is available.'))
      : Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      waiting.removeEventListener('statechange', checkState);
      signal?.removeEventListener('abort', abort);
    };
    const abort = (): void => {
      cleanup();
      reject(new Error('App service worker activation timed out.'));
    };
    const checkState = (): void => {
      if (waiting.state === 'activated') {
        cleanup();
        resolve();
      } else if (waiting.state === 'redundant') {
        cleanup();
        reject(new Error('The waiting app service worker was superseded. Retry the update.'));
      }
    };

    waiting.addEventListener('statechange', checkState);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      checkState();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};
