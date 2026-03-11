import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

const createToastStore = () => {
  const { subscribe, set, update } = writable<Toast[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTimer = (id: string): void => {
    const timerId = timers.get(id);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timers.delete(id);
    }
  };

  const remove = (id: string) => {
    clearTimer(id);
    update((toasts) => toasts.filter((t) => t.id !== id));
  };

  const show = (message: string, type: ToastType = 'info', durationMs = 4000) => {
    const id = crypto.randomUUID();
    const toast: Toast = { id, message, type, durationMs };

    update((toasts) => [...toasts, toast]);

    if (durationMs > 0) {
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          remove(id);
        }, durationMs),
      );
    }

    return id;
  };

  const clear = () => {
    for (const timerId of timers.values()) {
      clearTimeout(timerId);
    }
    timers.clear();
    set([]);
  };

  return {
    subscribe,
    show,
    remove,
    clear,
  };
};

export const appToastStore = createToastStore();
