// Resolves the shared cache store for app-shell startup flows and localhost browser-test overrides.
import { appCacheStore, type CacheStore } from '@cache';

declare global {
  interface Window {
    __CONSPECTUS_APP_CACHE_STORE__?: CacheStore;
  }
}

const isLocalCacheMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

const isCacheStore = (value: unknown): value is CacheStore => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<CacheStore>;
  return (
    typeof candidate.readSnapshot === 'function' &&
    typeof candidate.writeSnapshot === 'function' &&
    typeof candidate.clearSnapshot === 'function' &&
    typeof candidate.clearAll === 'function'
  );
};

export const resolveAppCacheStore = (): CacheStore => {
  if (isLocalCacheMockHost() && isCacheStore(window.__CONSPECTUS_APP_CACHE_STORE__)) {
    return window.__CONSPECTUS_APP_CACHE_STORE__;
  }

  return appCacheStore;
};
