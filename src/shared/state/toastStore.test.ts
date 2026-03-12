// Verifies toast-store timer cleanup and auto-dismiss behavior for reusable store instances.
import { describe, expect, it, vi } from 'vitest';

import { createToastStore } from './toastStore';

describe('toastStore', () => {
  it('auto-dismisses timed toasts after the configured duration', async () => {
    vi.useFakeTimers();
    const store = createToastStore();
    let currentToasts: readonly { id: string }[] = [];
    const unsubscribe = store.subscribe((toasts) => {
      currentToasts = toasts;
    });

    store.show('Sync complete.', 'success', 1200);
    expect(currentToasts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1200);

    expect(currentToasts).toHaveLength(0);

    unsubscribe();
    store.destroy();
    vi.useRealTimers();
  });

  it('clears outstanding timers when the store is destroyed', () => {
    vi.useFakeTimers();
    const store = createToastStore();

    store.show('Syncing...', 'info', 5000);
    store.show('Retrying...', 'warning', 3000);
    expect(vi.getTimerCount()).toBe(2);

    store.destroy();

    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
