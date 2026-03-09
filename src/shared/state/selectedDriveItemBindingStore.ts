// Provides an app-level store for the selected OneDrive database binding with localStorage persistence.
import { writable, type Readable } from 'svelte/store';
import type { DriveItemBinding } from '@graph';

export interface SelectedDriveItemBindingStore extends Readable<DriveItemBinding | null> {
  setActiveAccountId(accountId: string | null): void;
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
  readonly initialActiveAccountId?: string | null;
}

const DEFAULT_STORAGE_KEY = 'conspectus.selectedDriveItemBinding';
interface PersistedBindingPayload {
  readonly accountId: string;
  readonly binding: DriveItemBinding;
}

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

const isPersistedBindingPayload = (value: unknown): value is PersistedBindingPayload =>
  isRecord(value) &&
  typeof value.accountId === 'string' &&
  value.accountId.trim().length > 0 &&
  isDriveItemBinding(value.binding);

const normalizeAccountId = (accountId: string | null | undefined): string | null => {
  if (accountId === null || accountId === undefined) {
    return null;
  }

  const trimmedAccountId = accountId.trim();
  return trimmedAccountId.length > 0 ? trimmedAccountId : null;
};

const resolveDefaultStorage = (): StorageAdapter | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
};

const loadStoredBinding = (
  storage: StorageAdapter | null,
  storageKey: string,
  accountId: string | null,
): DriveItemBinding | null => {
  if (storage === null || accountId === null) {
    return null;
  }

  try {
    const rawValue = storage.getItem(storageKey);
    if (rawValue === null) {
      return null;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isPersistedBindingPayload(parsedValue)) {
      return null;
    }

    return parsedValue.accountId === accountId ? parsedValue.binding : null;
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
  let activeAccountId = normalizeAccountId(options.initialActiveAccountId);
  const persistedBinding = loadStoredBinding(storage, storageKey, activeAccountId);
  const { subscribe, set } = writable<DriveItemBinding | null>(initialBinding ?? persistedBinding);

  const persistBinding = (binding: DriveItemBinding | null): void => {
    if (storage === null || activeAccountId === null) {
      return;
    }

    try {
      if (binding === null) {
        storage.removeItem(storageKey);
        return;
      }

      storage.setItem(
        storageKey,
        JSON.stringify({
          accountId: activeAccountId,
          binding,
        } satisfies PersistedBindingPayload),
      );
    } catch {
      // Persistence failures should not block in-memory state updates.
    }
  };

  return {
    subscribe,
    setActiveAccountId: (accountId) => {
      activeAccountId = normalizeAccountId(accountId);
      set(loadStoredBinding(storage, storageKey, activeAccountId));
    },
    setBinding: (binding) => {
      persistBinding(binding);
      set(activeAccountId === null ? null : binding);
    },
    clear: () => {
      persistBinding(null);
      set(null);
    },
  };
};

export const appSelectedDriveItemBindingStore = createSelectedDriveItemBindingStore();
