import { readable, type Readable } from 'svelte/store';

export type NetworkStateStore = Readable<boolean>;

const isBrowser = typeof window !== 'undefined';

export const appNetworkStateStore: NetworkStateStore = readable(
  isBrowser ? window.navigator.onLine : true,
  (set) => {
    if (!isBrowser) {
      return () => {};
    }

    const setOnline = () => set(true);
    const setOffline = () => set(false);

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);

    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
    };
  },
);
