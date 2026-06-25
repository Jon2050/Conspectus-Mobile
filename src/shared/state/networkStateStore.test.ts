import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

describe('networkStateStore', () => {
  let appNetworkStateStore: typeof import('./networkStateStore').appNetworkStateStore;
  let listeners: Record<string, () => void> = {};

  beforeEach(async () => {
    listeners = {};
    vi.stubGlobal('window', {
      navigator: { onLine: true },
      addEventListener: (evt: string, cb: () => void) => {
        listeners[evt] = cb;
      },
      removeEventListener: (evt: string) => {
        delete listeners[evt];
      },
      dispatchEvent: (evt: Event) => {
        listeners[evt.type]?.();
      },
    });
    vi.resetModules();
    const module = await import('./networkStateStore');
    appNetworkStateStore = module.appNetworkStateStore;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes with current navigator.onLine state', () => {
    expect(get(appNetworkStateStore)).toBe(true);
  });

  it('updates state when online and offline events fire', () => {
    const unsubscribe = appNetworkStateStore.subscribe(() => {});

    window.dispatchEvent(new Event('offline'));
    expect(get(appNetworkStateStore)).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(get(appNetworkStateStore)).toBe(true);

    unsubscribe();
  });
});
