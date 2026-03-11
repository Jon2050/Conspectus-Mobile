// Verifies the Settings cache resolver uses localhost overrides and safely closes live cache connections before IndexedDB reset.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MemoryStorageLike {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const closeAppCacheStoreConnections = vi.fn();

const createMemoryStorage = (initialValues: Record<string, string>): MemoryStorageLike => {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

describe('settings cache store resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.doMock('@cache', () => ({
      closeAppCacheStoreConnections,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses localhost test override cache store when available', async () => {
    const overrideClearAll = vi.fn(async () => {});
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1' },
      __CONSPECTUS_CACHE_STORE__: { clearAll: overrideClearAll },
    });

    const { resolveSettingsCacheStore } = await import('./settingsCacheStoreResolver');
    await resolveSettingsCacheStore().clearAll();

    expect(overrideClearAll).toHaveBeenCalledTimes(1);
    expect(closeAppCacheStoreConnections).not.toHaveBeenCalled();
  });

  it('clears app-owned storage, CacheStorage, and IndexedDB entries by default', async () => {
    const localStorage = createMemoryStorage({
      'conspectus.selectedDriveItemBinding': '{"value":1}',
      'other-app-key': 'keep',
    });
    const sessionStorage = createMemoryStorage({
      'conspectus.session': 'temp',
      untouched: 'keep',
    });
    const cacheDelete = vi.fn(async () => true);
    const indexedDbDeleteDatabase = vi.fn();
    vi.stubGlobal('window', {
      location: { hostname: 'jon2050.de' },
      localStorage,
      sessionStorage,
      caches: {
        keys: vi.fn(async () => ['conspectus-mobile-precache-v1', 'unrelated-cache']),
        delete: cacheDelete,
      },
      indexedDB: {
        databases: vi.fn(async () => [{ name: 'conspectus-mobile-cache' }, { name: 'other-db' }]),
        deleteDatabase: indexedDbDeleteDatabase,
      },
    });

    const { resolveSettingsCacheStore } = await import('./settingsCacheStoreResolver');
    await resolveSettingsCacheStore().clearAll();

    expect(localStorage.getItem('conspectus.selectedDriveItemBinding')).toBeNull();
    expect(localStorage.getItem('other-app-key')).toBe('keep');
    expect(sessionStorage.getItem('conspectus.session')).toBeNull();
    expect(sessionStorage.getItem('untouched')).toBe('keep');
    expect(cacheDelete).toHaveBeenCalledTimes(1);
    expect(cacheDelete).toHaveBeenCalledWith('conspectus-mobile-precache-v1');
    expect(closeAppCacheStoreConnections).toHaveBeenCalledTimes(1);
    expect(indexedDbDeleteDatabase).toHaveBeenCalledTimes(2);
    expect(indexedDbDeleteDatabase).toHaveBeenNthCalledWith(1, 'conspectus-mobile-cache');
    expect(indexedDbDeleteDatabase).toHaveBeenNthCalledWith(2, 'conspectus-cache');

    const closeCallOrder = closeAppCacheStoreConnections.mock.invocationCallOrder[0];
    const deleteCallOrder = indexedDbDeleteDatabase.mock.invocationCallOrder[0];
    expect(closeCallOrder).toBeDefined();
    expect(deleteCallOrder).toBeDefined();
    expect(closeCallOrder ?? 0).toBeLessThan(deleteCallOrder ?? 0);
  });

  it('falls back to known IndexedDB cleanup targets when databases enumeration throws', async () => {
    const indexedDbDeleteDatabase = vi.fn();
    vi.stubGlobal('window', {
      location: { hostname: 'jon2050.de' },
      localStorage: createMemoryStorage({}),
      sessionStorage: createMemoryStorage({}),
      caches: {
        keys: vi.fn(async () => []),
        delete: vi.fn(async () => true),
      },
      indexedDB: {
        databases: vi.fn(async () => {
          throw new Error('Enumeration blocked.');
        }),
        deleteDatabase: indexedDbDeleteDatabase,
      },
    });

    const { resolveSettingsCacheStore } = await import('./settingsCacheStoreResolver');
    await resolveSettingsCacheStore().clearAll();

    expect(closeAppCacheStoreConnections).toHaveBeenCalledTimes(1);
    expect(indexedDbDeleteDatabase).toHaveBeenCalledTimes(2);
    expect(indexedDbDeleteDatabase).toHaveBeenNthCalledWith(1, 'conspectus-mobile-cache');
    expect(indexedDbDeleteDatabase).toHaveBeenNthCalledWith(2, 'conspectus-cache');
  });
});
