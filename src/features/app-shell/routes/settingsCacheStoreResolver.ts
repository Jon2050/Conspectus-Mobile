// Resolves the cache store used by Settings local-reset actions, with localhost-only test override support.
import { closeAppCacheStoreConnections, type CacheStore } from '@cache';

declare global {
  interface Window {
    __CONSPECTUS_CACHE_STORE__?: Pick<CacheStore, 'clearAll'>;
  }
}

const FALLBACK_INDEXEDDB_DATABASE_NAMES = ['conspectus-mobile-cache', 'conspectus-cache'];

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
        closeAppCacheStoreConnections();

        const filterConspectusDatabaseNames = (databaseNames: readonly string[]): string[] =>
          databaseNames.filter(
            (databaseName) =>
              databaseName.length > 0 && databaseName.toLowerCase().includes('conspectus'),
          );

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

        let resolvedDatabaseNames = [...FALLBACK_INDEXEDDB_DATABASE_NAMES];
        if (typeof indexedDbApi.databases === 'function') {
          try {
            resolvedDatabaseNames = [
              ...FALLBACK_INDEXEDDB_DATABASE_NAMES,
              ...(await indexedDbApi.databases()).map((database) => database.name?.trim() ?? ''),
            ];
          } catch {
            resolvedDatabaseNames = [...FALLBACK_INDEXEDDB_DATABASE_NAMES];
          }
        }

        const uniqueDatabaseNames = [
          ...new Set(filterConspectusDatabaseNames(resolvedDatabaseNames)),
        ];

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
