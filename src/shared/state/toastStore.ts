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

  const remove = (id: string) => {
    update((toasts) => toasts.filter((t) => t.id !== id));
  };

  const show = (message: string, type: ToastType = 'info', durationMs = 4000) => {
    const id = crypto.randomUUID();
    const toast: Toast = { id, message, type, durationMs };

    update((toasts) => [...toasts, toast]);

    if (durationMs > 0) {
      setTimeout(() => {
        remove(id);
      }, durationMs);
    }

    return id;
  };

  return {
    subscribe,
    show,
    remove,
    clear: () => set([]),
  };
};

export const appToastStore = createToastStore();
