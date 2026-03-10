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
const LEGACY_PERSISTED_BINDING_SCHEMA_VERSION = 1;
const PERSISTED_BINDING_SCHEMA_VERSION = 2;

interface PersistedBindingPayload {
  readonly version: typeof PERSISTED_BINDING_SCHEMA_VERSION;
  readonly bindingsByAccountId: Record<string, DriveItemBinding>;
}

interface LegacyPersistedBindingPayload {
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

const isLegacyPersistedBindingPayload = (value: unknown): value is LegacyPersistedBindingPayload =>
  isRecord(value) &&
  typeof value.accountId === 'string' &&
  value.accountId.trim().length > 0 &&
  isDriveItemBinding(value.binding);

const isBindingsByAccountIdRecord = (value: unknown): value is Record<string, DriveItemBinding> => {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(([accountId, binding]) => {
    return accountId.trim().length > 0 && isDriveItemBinding(binding);
  });
};

const parsePersistedBindingPayload = (value: unknown): PersistedBindingPayload | null => {
  if (isRecord(value) && value.version === PERSISTED_BINDING_SCHEMA_VERSION) {
    if (!isBindingsByAccountIdRecord(value.bindingsByAccountId)) {
      return null;
    }

    return {
      version: PERSISTED_BINDING_SCHEMA_VERSION,
      bindingsByAccountId: value.bindingsByAccountId,
    };
  }

  if (isRecord(value) && value.version === LEGACY_PERSISTED_BINDING_SCHEMA_VERSION) {
    if (!isLegacyPersistedBindingPayload(value)) {
      return null;
    }

    return {
      version: PERSISTED_BINDING_SCHEMA_VERSION,
      bindingsByAccountId: {
        [value.accountId]: value.binding,
      },
    };
  }

  if (isLegacyPersistedBindingPayload(value)) {
    return {
      version: PERSISTED_BINDING_SCHEMA_VERSION,
      bindingsByAccountId: {
        [value.accountId]: value.binding,
      },
    };
  }

  return null;
};

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

const readPersistedBindingPayload = (
  storage: StorageAdapter | null,
  storageKey: string,
): PersistedBindingPayload | null => {
  if (storage === null) {
    return null;
  }

  let rawValue: string | null;

  try {
    rawValue = storage.getItem(storageKey);
  } catch {
    return null;
  }

  if (rawValue === null) {
    return null;
  }

  try {
    return parsePersistedBindingPayload(JSON.parse(rawValue));
  } catch {
    return null;
  }
};

const loadStoredBinding = (
  storage: StorageAdapter | null,
  storageKey: string,
  accountId: string | null,
): DriveItemBinding | null => {
  if (storage === null || accountId === null) {
    return null;
  }

  const parsedValue = readPersistedBindingPayload(storage, storageKey);
  if (parsedValue === null) {
    return null;
  }

  return parsedValue.bindingsByAccountId[accountId] ?? null;
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

  const persistActiveAccountBinding = (binding: DriveItemBinding | null): void => {
    if (storage === null || activeAccountId === null) {
      return;
    }

    const existingPayload = readPersistedBindingPayload(storage, storageKey);
    const bindingsByAccountId = { ...(existingPayload?.bindingsByAccountId ?? {}) };

    if (binding === null) {
      delete bindingsByAccountId[activeAccountId];
    } else {
      bindingsByAccountId[activeAccountId] = binding;
    }

    try {
      if (Object.keys(bindingsByAccountId).length === 0) {
        storage.removeItem(storageKey);
        return;
      }

      storage.setItem(
        storageKey,
        JSON.stringify({
          version: PERSISTED_BINDING_SCHEMA_VERSION,
          bindingsByAccountId,
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
      persistActiveAccountBinding(binding);
      set(activeAccountId === null ? null : binding);
    },
    clear: () => {
      persistActiveAccountBinding(null);
      set(null);
    },
  };
};

export const appSelectedDriveItemBindingStore = createSelectedDriveItemBindingStore();
