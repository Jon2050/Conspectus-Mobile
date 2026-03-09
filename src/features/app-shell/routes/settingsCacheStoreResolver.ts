// Resolves the cache store used by Settings local-reset actions, with localhost-only test override support.
import type { CacheStore } from '@cache';

declare global {
  interface Window {
    __CONSPECTUS_CACHE_STORE__?: Pick<CacheStore, 'clearAll'>;
  }
}

const defaultCacheStore: Pick<CacheStore, 'clearAll'> = {
  async clearAll(): Promise<void> {
    if (typeof window === 'undefined') {
      return;
    }

    const errors: unknown[] = [];

    const clearConspectusStorageKeys = (storage: Storage): void => {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key !== null && key.startsWith('conspectus.')) {
          storage.removeItem(key);
        }
      }
    };

    try {
      clearConspectusStorageKeys(window.localStorage);
    } catch (error) {
      errors.push(error);
    }

    try {
      clearConspectusStorageKeys(window.sessionStorage);
    } catch (error) {
      errors.push(error);
    }

    try {
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(
          cacheKeys
            .filter((cacheKey) => cacheKey.toLowerCase().includes('conspectus'))
            .map((cacheKey) => window.caches.delete(cacheKey)),
        );
      }
    } catch (error) {
      errors.push(error);
    }

    try {
      const indexedDbApi = window.indexedDB;
      if (typeof indexedDbApi !== 'undefined') {
        const deleteIndexedDatabase = async (databaseName: string): Promise<void> => {
          const request = indexedDbApi.deleteDatabase(databaseName);
          if (request === undefined || typeof request !== 'object' || !('onsuccess' in request)) {
            return;
          }

          await new Promise<void>((resolve, reject) => {
            request.onsuccess = () => {
              resolve();
            };
            request.onerror = () => {
              reject(request.error ?? new Error(`Failed to delete IndexedDB "${databaseName}".`));
            };
            request.onblocked = () => {
              reject(new Error(`IndexedDB "${databaseName}" deletion was blocked.`));
            };
          });
        };

        const resolvedDatabaseNames =
          typeof indexedDbApi.databases === 'function'
            ? (await indexedDbApi.databases())
                .map((database) => database.name?.trim() ?? '')
                .filter(
                  (databaseName) =>
                    databaseName.length > 0 && databaseName.toLowerCase().includes('conspectus'),
                )
            : ['conspectus-mobile-cache', 'conspectus-cache'];
        const uniqueDatabaseNames = [...new Set(resolvedDatabaseNames)];

        for (const databaseName of uniqueDatabaseNames) {
          await deleteIndexedDatabase(databaseName);
        }
      }
    } catch (error) {
      errors.push(error);
    }

    if (errors.length > 0) {
      throw new Error('Failed to clear all local app cache data.', {
        cause: errors[0],
      });
    }
  },
};

const isLocalCacheMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

export const resolveSettingsCacheStore = (): Pick<CacheStore, 'clearAll'> => {
  if (isLocalCacheMockHost() && window.__CONSPECTUS_CACHE_STORE__ !== undefined) {
    return window.__CONSPECTUS_CACHE_STORE__;
  }

  return defaultCacheStore;
};
