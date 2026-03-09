// Provides an app-level store for the selected OneDrive database binding with localStorage persistence.
import { writable, type Readable } from 'svelte/store';
import type { DriveItemBinding } from '@graph';

export interface SelectedDriveItemBindingStore extends Readable<DriveItemBinding | null> {
  setBinding(binding: DriveItemBinding): void;
  clear(): void;
}

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CreateSelectedDriveItemBindingStoreOptions {
  readonly storageKey?: string;
  readonly storage?: StorageAdapter | null;
}

const DEFAULT_STORAGE_KEY = 'conspectus.selectedDriveItemBinding';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isDriveItemBinding = (value: unknown): value is DriveItemBinding =>
  isRecord(value) &&
  typeof value.driveId === 'string' &&
  typeof value.itemId === 'string' &&
  typeof value.name === 'string' &&
  typeof value.parentPath === 'string' &&
  value.driveId.trim().length > 0 &&
  value.itemId.trim().length > 0 &&
  value.name.trim().length > 0 &&
  value.parentPath.trim().length > 0;

const resolveDefaultStorage = (): StorageAdapter | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
};

const loadStoredBinding = (
  storage: StorageAdapter | null,
  storageKey: string,
): DriveItemBinding | null => {
  if (storage === null) {
    return null;
  }

  try {
    const rawValue = storage.getItem(storageKey);
    if (rawValue === null) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    return isDriveItemBinding(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

export const createSelectedDriveItemBindingStore = (
  initialBinding: DriveItemBinding | null = null,
  options: CreateSelectedDriveItemBindingStoreOptions = {},
): SelectedDriveItemBindingStore => {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const storage = options.storage ?? resolveDefaultStorage();
  const persistedBinding = loadStoredBinding(storage, storageKey);
  const { subscribe, set } = writable<DriveItemBinding | null>(initialBinding ?? persistedBinding);

  const persistBinding = (binding: DriveItemBinding | null): void => {
    if (storage === null) {
      return;
    }

    try {
      if (binding === null) {
        storage.removeItem(storageKey);
        return;
      }

      storage.setItem(storageKey, JSON.stringify(binding));
    } catch {
      // Persistence failures should not block in-memory state updates.
    }
  };

  return {
    subscribe,
    setBinding: (binding) => {
      persistBinding(binding);
      set(binding);
    },
    clear: () => {
      persistBinding(null);
      set(null);
    },
  };
};

export const appSelectedDriveItemBindingStore = createSelectedDriveItemBindingStore();
