// Verifies the app-level selected OneDrive binding store can set and clear bindings predictably.
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';

import { createSelectedDriveItemBindingStore } from './selectedDriveItemBindingStore';

const createMemoryStorage = (): {
  readonly storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  readonly values: Record<string, string>;
} => {
  const values: Record<string, string> = {};

  return {
    storage: {
      getItem: (key) => values[key] ?? null,
      setItem: (key, value) => {
        values[key] = value;
      },
      removeItem: (key) => {
        delete values[key];
      },
    },
    values,
  };
};

describe('createSelectedDriveItemBindingStore', () => {
  it('starts empty by default', () => {
    const { storage } = createMemoryStorage();
    const store = createSelectedDriveItemBindingStore(null, { storage });

    expect(get(store)).toBeNull();
  });

  it('stores and clears the selected binding in state and storage', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    const store = createSelectedDriveItemBindingStore(null, { storage, storageKey });
    const binding = {
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    } as const;

    store.setBinding(binding);
    expect(get(store)).toEqual(binding);
    expect(values[storageKey]).toBe(JSON.stringify(binding));

    store.clear();
    expect(get(store)).toBeNull();
    expect(values[storageKey]).toBeUndefined();
  });

  it('hydrates an existing persisted binding', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    const binding = {
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    } as const;
    values[storageKey] = JSON.stringify(binding);

    const store = createSelectedDriveItemBindingStore(null, { storage, storageKey });

    expect(get(store)).toEqual(binding);
  });

  it('ignores invalid persisted payloads', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    values[storageKey] = JSON.stringify({
      driveId: 'drive-123',
      itemId: '',
      name: 'conspectus.db',
      parentPath: '/Finance',
    });

    const store = createSelectedDriveItemBindingStore(null, { storage, storageKey });

    expect(get(store)).toBeNull();
  });
});
