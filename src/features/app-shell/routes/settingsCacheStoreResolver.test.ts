// Verifies the Settings cache resolver uses localhost overrides and clears app-owned local caches by default.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MemoryStorageLike {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

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
    expect(indexedDbDeleteDatabase).toHaveBeenCalledTimes(1);
    expect(indexedDbDeleteDatabase).toHaveBeenCalledWith('conspectus-mobile-cache');
  });
});
