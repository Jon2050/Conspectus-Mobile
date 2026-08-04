// Persists schema-versioned OpenRouter receipt settings separately for each Microsoft account.
import type { StoredOpenRouterReceiptSettings } from './openRouterReceiptConfiguration';

const OPENROUTER_SETTINGS_STORAGE_KEY = 'conspectus.openRouterReceiptSettings';
const OPENROUTER_SETTINGS_SCHEMA_VERSION = 1;

export interface OpenRouterSettingsStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface OpenRouterSettingsStore {
  read(accountId: string): StoredOpenRouterReceiptSettings | null;
  write(accountId: string, settings: StoredOpenRouterReceiptSettings): void;
  clear(accountId: string): void;
}

interface OpenRouterSettingsPayload {
  readonly version: typeof OPENROUTER_SETTINGS_SCHEMA_VERSION;
  readonly settingsByAccountId: Record<string, StoredOpenRouterReceiptSettings>;
}

interface CreateOpenRouterSettingsStoreOptions {
  readonly storage?: OpenRouterSettingsStorageAdapter | null;
  readonly storageKey?: string;
}

export class OpenRouterSettingsStorageError extends Error {
  constructor() {
    super('OpenRouter settings could not be stored on this device.');
    this.name = 'OpenRouterSettingsStorageError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNullableNonEmptyString = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && value.trim().length > 0);

const isStoredSettings = (value: unknown): value is StoredOpenRouterReceiptSettings =>
  isRecord(value) &&
  typeof value.apiKey === 'string' &&
  value.apiKey.trim().length > 0 &&
  isNullableNonEmptyString(value.visionModelId) &&
  isNullableNonEmptyString(value.transferModelId) &&
  (value.transferRulesOverride === null || typeof value.transferRulesOverride === 'string');

const parsePayload = (value: unknown): OpenRouterSettingsPayload | null => {
  if (
    !isRecord(value) ||
    value.version !== OPENROUTER_SETTINGS_SCHEMA_VERSION ||
    !isRecord(value.settingsByAccountId)
  ) {
    return null;
  }

  const settingsByAccountId: Record<string, StoredOpenRouterReceiptSettings> = {};
  for (const [accountId, settings] of Object.entries(value.settingsByAccountId)) {
    if (!accountId.trim() || !isStoredSettings(settings)) {
      return null;
    }
    settingsByAccountId[accountId] = settings;
  }

  return {
    version: OPENROUTER_SETTINGS_SCHEMA_VERSION,
    settingsByAccountId,
  };
};

const normalizeAccountId = (accountId: string): string => {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    throw new OpenRouterSettingsStorageError();
  }
  return normalizedAccountId;
};

const resolveDefaultStorage = (): OpenRouterSettingsStorageAdapter | null =>
  typeof window === 'undefined' ? null : window.localStorage;

export const createOpenRouterSettingsStore = (
  options: CreateOpenRouterSettingsStoreOptions = {},
): OpenRouterSettingsStore => {
  const storage = options.storage ?? resolveDefaultStorage();
  const storageKey = options.storageKey ?? OPENROUTER_SETTINGS_STORAGE_KEY;

  const readPayload = (): OpenRouterSettingsPayload | null => {
    if (storage === null) {
      return null;
    }

    try {
      const rawValue = storage.getItem(storageKey);
      return rawValue === null ? null : parsePayload(JSON.parse(rawValue));
    } catch {
      return null;
    }
  };

  const persist = (settingsByAccountId: Record<string, StoredOpenRouterReceiptSettings>): void => {
    if (storage === null) {
      throw new OpenRouterSettingsStorageError();
    }

    try {
      if (Object.keys(settingsByAccountId).length === 0) {
        storage.removeItem(storageKey);
        return;
      }

      storage.setItem(
        storageKey,
        JSON.stringify({
          version: OPENROUTER_SETTINGS_SCHEMA_VERSION,
          settingsByAccountId,
        } satisfies OpenRouterSettingsPayload),
      );
    } catch {
      throw new OpenRouterSettingsStorageError();
    }
  };

  return {
    read(accountId): StoredOpenRouterReceiptSettings | null {
      const normalizedAccountId = normalizeAccountId(accountId);
      return readPayload()?.settingsByAccountId[normalizedAccountId] ?? null;
    },

    write(accountId, settings): void {
      const normalizedAccountId = normalizeAccountId(accountId);
      if (!isStoredSettings(settings)) {
        throw new OpenRouterSettingsStorageError();
      }

      const settingsByAccountId = { ...(readPayload()?.settingsByAccountId ?? {}) };
      settingsByAccountId[normalizedAccountId] = settings;
      persist(settingsByAccountId);
    },

    clear(accountId): void {
      const normalizedAccountId = normalizeAccountId(accountId);
      const payload = readPayload();
      if (payload === null || payload.settingsByAccountId[normalizedAccountId] === undefined) {
        return;
      }

      const settingsByAccountId = { ...payload.settingsByAccountId };
      delete settingsByAccountId[normalizedAccountId];
      persist(settingsByAccountId);
    },
  };
};

export const openRouterSettingsStore = createOpenRouterSettingsStore();
