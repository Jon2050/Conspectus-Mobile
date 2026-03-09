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
    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });
    const binding = {
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    } as const;

    store.setBinding(binding);
    expect(get(store)).toEqual(binding);
    expect(values[storageKey]).toBe(
      JSON.stringify({
        version: 2,
        bindingsByAccountId: {
          'account-1': binding,
        },
      }),
    );

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
    values[storageKey] = JSON.stringify({
      version: 2,
      bindingsByAccountId: {
        'account-1': binding,
      },
    });

    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });

    expect(get(store)).toEqual(binding);
  });

  it('ignores invalid persisted payloads', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    values[storageKey] = JSON.stringify({
      version: 2,
      bindingsByAccountId: {
        'account-1': {
          driveId: 'drive-123',
          itemId: '',
          name: 'conspectus.db',
          parentPath: '/Finance',
        },
      },
    });

    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });

    expect(get(store)).toBeNull();
  });

  it('does not hydrate persisted binding when account does not match', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    const binding = {
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    } as const;
    values[storageKey] = JSON.stringify({
      version: 2,
      bindingsByAccountId: {
        'account-1': binding,
      },
    });

    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-2',
    });

    expect(get(store)).toBeNull();
  });

  it('switches hydrated binding when the active account changes', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    values[storageKey] = JSON.stringify({
      version: 2,
      bindingsByAccountId: {
        'account-1': {
          driveId: 'drive-123',
          itemId: 'item-456',
          name: 'conspectus.db',
          parentPath: '/Finance',
        },
      },
    });
    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-2',
    });

    expect(get(store)).toBeNull();

    store.setActiveAccountId('account-1');

    expect(get(store)).toEqual({
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    });
  });

  it('hydrates legacy unversioned payloads to preserve existing local bindings', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    values[storageKey] = JSON.stringify({
      accountId: 'account-1',
      binding: {
        driveId: 'drive-123',
        itemId: 'item-456',
        name: 'conspectus.db',
        parentPath: '/Finance',
      },
    });

    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });

    expect(get(store)).toEqual({
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    });
  });

  it('hydrates legacy v1 payloads to preserve existing local bindings', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    values[storageKey] = JSON.stringify({
      version: 1,
      accountId: 'account-1',
      binding: {
        driveId: 'drive-123',
        itemId: 'item-456',
        name: 'conspectus.db',
        parentPath: '/Finance',
      },
    });

    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });

    expect(get(store)).toEqual({
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    });
  });

  it('ignores persisted payloads with unsupported schema versions', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    values[storageKey] = JSON.stringify({
      version: 99,
      bindingsByAccountId: {
        'account-1': {
          driveId: 'drive-123',
          itemId: 'item-456',
          name: 'conspectus.db',
          parentPath: '/Finance',
        },
      },
    });

    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });

    expect(get(store)).toBeNull();
  });

  it('keeps separate bindings per account in storage', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });
    const bindingOne = {
      driveId: 'drive-123',
      itemId: 'item-1',
      name: 'first.db',
      parentPath: '/Finance',
    } as const;
    const bindingTwo = {
      driveId: 'drive-123',
      itemId: 'item-2',
      name: 'second.db',
      parentPath: '/Private',
    } as const;

    store.setBinding(bindingOne);
    store.setActiveAccountId('account-2');
    store.setBinding(bindingTwo);

    expect(get(store)).toEqual(bindingTwo);

    store.setActiveAccountId('account-1');
    expect(get(store)).toEqual(bindingOne);

    expect(values[storageKey]).toBe(
      JSON.stringify({
        version: 2,
        bindingsByAccountId: {
          'account-1': bindingOne,
          'account-2': bindingTwo,
        },
      }),
    );
  });

  it('clears only the active account binding and preserves other account bindings', () => {
    const { storage, values } = createMemoryStorage();
    const storageKey = 'binding-key';
    const bindingOne = {
      driveId: 'drive-123',
      itemId: 'item-1',
      name: 'first.db',
      parentPath: '/Finance',
    } as const;
    const bindingTwo = {
      driveId: 'drive-123',
      itemId: 'item-2',
      name: 'second.db',
      parentPath: '/Private',
    } as const;
    values[storageKey] = JSON.stringify({
      version: 2,
      bindingsByAccountId: {
        'account-1': bindingOne,
        'account-2': bindingTwo,
      },
    });
    const store = createSelectedDriveItemBindingStore(null, {
      storage,
      storageKey,
      initialActiveAccountId: 'account-1',
    });

    store.clear();

    expect(get(store)).toBeNull();
    expect(values[storageKey]).toBe(
      JSON.stringify({
        version: 2,
        bindingsByAccountId: {
          'account-2': bindingTwo,
        },
      }),
    );

    store.setActiveAccountId('account-2');
    expect(get(store)).toEqual(bindingTwo);
  });
});
