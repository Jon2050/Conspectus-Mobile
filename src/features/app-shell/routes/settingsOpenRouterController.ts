// Orchestrates account-scoped OpenRouter key validation and receipt AI Settings state.
import {
  OpenRouterCatalogError,
  openRouterModelCatalogClient,
  type OpenRouterCompatibleModelCatalog,
  type OpenRouterModelCatalogClient,
  type OpenRouterModelOption,
} from '@openrouter';

import {
  DEFAULT_TRANSFER_DERIVATION_PROMPT,
  createEmptyOpenRouterReceiptSettings,
  openRouterSettingsStore,
  reconcileOpenRouterModelSelections,
  resolveTransferDerivationPrompt,
  toReadyOpenRouterReceiptConfiguration,
  type OpenRouterSettingsStore,
  type ReadyOpenRouterReceiptConfiguration,
  type StoredOpenRouterReceiptSettings,
} from '../../receipt';

export type SettingsOpenRouterCatalogStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'invalid_key'
  | 'network_error'
  | 'provider_error'
  | 'invalid_response'
  | 'storage_error';

export type SettingsOpenRouterActionError = 'key_required' | 'storage_error' | null;

export interface SettingsOpenRouterState {
  readonly catalogStatus: SettingsOpenRouterCatalogStatus;
  readonly actionError: SettingsOpenRouterActionError;
  readonly hasStoredApiKey: boolean;
  readonly visionModels: readonly OpenRouterModelOption[];
  readonly transferModels: readonly OpenRouterModelOption[];
  readonly selectedVisionModelId: string | null;
  readonly selectedTransferModelId: string | null;
  readonly transferPrompt: string;
  readonly transferPromptUsesDefault: boolean;
  readonly configurationIsReady: boolean;
}

export type SettingsOpenRouterStateListener = (state: SettingsOpenRouterState) => void;

export interface SettingsOpenRouterController {
  getState(): SettingsOpenRouterState;
  subscribe(listener: SettingsOpenRouterStateListener): () => void;
  activateAccount(accountId: string | null): Promise<void>;
  validateAndSaveApiKey(apiKey: string): Promise<boolean>;
  retryCatalog(): Promise<boolean>;
  deleteConfiguration(): void;
  selectVisionModel(modelId: string): void;
  selectTransferModel(modelId: string): void;
  setTransferPrompt(prompt: string): void;
  resetTransferPrompt(): void;
  clearAfterLocalReset(): void;
  getReadyConfiguration(): ReadyOpenRouterReceiptConfiguration | null;
  dispose(): void;
}

interface CreateSettingsOpenRouterControllerOptions {
  readonly catalogClient?: OpenRouterModelCatalogClient;
  readonly settingsStore?: OpenRouterSettingsStore;
}

const INITIAL_STATE: SettingsOpenRouterState = {
  catalogStatus: 'idle',
  actionError: null,
  hasStoredApiKey: false,
  visionModels: [],
  transferModels: [],
  selectedVisionModelId: null,
  selectedTransferModelId: null,
  transferPrompt: DEFAULT_TRANSFER_DERIVATION_PROMPT.text,
  transferPromptUsesDefault: true,
  configurationIsReady: false,
};

const normalizeAccountId = (accountId: string | null): string | null => {
  const normalizedAccountId = accountId?.trim() ?? '';
  return normalizedAccountId || null;
};

const normalizeModelId = (modelId: string): string | null => {
  const normalizedModelId = modelId.trim();
  return normalizedModelId || null;
};

export const createSettingsOpenRouterController = (
  options: CreateSettingsOpenRouterControllerOptions = {},
): SettingsOpenRouterController => {
  const catalogClient = options.catalogClient ?? openRouterModelCatalogClient;
  const settingsStore = options.settingsStore ?? openRouterSettingsStore;
  const listeners = new Set<SettingsOpenRouterStateListener>();
  let state = INITIAL_STATE;
  let activeAccountId: string | null = null;
  let storedSettings: StoredOpenRouterReceiptSettings | null = null;
  let pendingApiKey: string | null = null;
  let validatedCatalog: OpenRouterCompatibleModelCatalog | null = null;
  let activeRequest: AbortController | null = null;
  let requestId = 0;

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const publishState = (
    catalogStatus: SettingsOpenRouterCatalogStatus,
    actionError: SettingsOpenRouterActionError = null,
  ): void => {
    const readyCatalog = catalogStatus === 'ready' ? validatedCatalog : null;
    const transferPrompt =
      storedSettings === null
        ? DEFAULT_TRANSFER_DERIVATION_PROMPT.text
        : resolveTransferDerivationPrompt(storedSettings);

    state = {
      catalogStatus,
      actionError,
      hasStoredApiKey: storedSettings !== null,
      visionModels: readyCatalog?.visionModels ?? [],
      transferModels: readyCatalog?.transferModels ?? [],
      selectedVisionModelId: readyCatalog === null ? null : (storedSettings?.visionModelId ?? null),
      selectedTransferModelId:
        readyCatalog === null ? null : (storedSettings?.transferModelId ?? null),
      transferPrompt,
      transferPromptUsesDefault:
        storedSettings === null || storedSettings.transferPromptOverride === null,
      configurationIsReady:
        readyCatalog !== null && storedSettings !== null
          ? toReadyOpenRouterReceiptConfiguration(storedSettings, readyCatalog) !== null
          : false,
    };
    emitState();
  };

  const abortRequest = (): void => {
    requestId += 1;
    activeRequest?.abort();
    activeRequest = null;
  };

  const persistSettings = (nextSettings: StoredOpenRouterReceiptSettings): boolean => {
    if (activeAccountId === null) {
      return false;
    }

    try {
      settingsStore.write(activeAccountId, nextSettings);
      storedSettings = nextSettings;
      return true;
    } catch {
      return false;
    }
  };

  const toCatalogFailureStatus = (
    error: unknown,
  ): Exclude<SettingsOpenRouterCatalogStatus, 'idle' | 'loading' | 'ready' | 'storage_error'> => {
    if (!(error instanceof OpenRouterCatalogError)) {
      return 'invalid_response';
    }

    if (error.code === 'invalid_key') {
      return 'invalid_key';
    }
    if (error.code === 'network_error') {
      return 'network_error';
    }
    if (error.code === 'provider_error') {
      return 'provider_error';
    }
    return 'invalid_response';
  };

  const loadCatalog = async (apiKey: string, replaceStoredKey: boolean): Promise<boolean> => {
    if (activeAccountId === null) {
      return false;
    }

    abortRequest();
    const currentRequestId = requestId;
    const requestAccountId = activeAccountId;
    const abortController = new AbortController();
    activeRequest = abortController;
    validatedCatalog = null;
    publishState('loading');

    try {
      const catalog = await catalogClient.load(apiKey, abortController.signal);
      if (currentRequestId !== requestId || requestAccountId !== activeAccountId) {
        return false;
      }

      const baseSettings = replaceStoredKey
        ? { ...(storedSettings ?? createEmptyOpenRouterReceiptSettings(apiKey)), apiKey }
        : storedSettings;
      if (baseSettings === null) {
        publishState('invalid_key');
        return false;
      }

      const reconciledSettings = reconcileOpenRouterModelSelections(baseSettings, catalog);
      if (!persistSettings(reconciledSettings)) {
        validatedCatalog = null;
        publishState('storage_error');
        return false;
      }

      validatedCatalog = catalog;
      pendingApiKey = null;
      publishState('ready');
      return true;
    } catch (error) {
      if (
        currentRequestId !== requestId ||
        requestAccountId !== activeAccountId ||
        (error instanceof OpenRouterCatalogError && error.code === 'aborted')
      ) {
        return false;
      }

      validatedCatalog = null;
      publishState(toCatalogFailureStatus(error));
      return false;
    } finally {
      if (currentRequestId === requestId) {
        activeRequest = null;
      }
    }
  };

  const persistReadyUpdate = (nextSettings: StoredOpenRouterReceiptSettings): void => {
    if (state.catalogStatus !== 'ready' || validatedCatalog === null) {
      return;
    }

    if (!persistSettings(nextSettings)) {
      publishState('ready', 'storage_error');
      return;
    }

    publishState('ready');
  };

  const controller: SettingsOpenRouterController = {
    getState(): SettingsOpenRouterState {
      return state;
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },

    async activateAccount(accountId): Promise<void> {
      const normalizedAccountId = normalizeAccountId(accountId);
      if (activeAccountId === normalizedAccountId) {
        return;
      }

      abortRequest();
      activeAccountId = normalizedAccountId;
      storedSettings = null;
      pendingApiKey = null;
      validatedCatalog = null;
      publishState('idle');

      if (activeAccountId === null) {
        return;
      }

      storedSettings = settingsStore.read(activeAccountId);
      publishState('idle');
      if (storedSettings !== null) {
        await loadCatalog(storedSettings.apiKey, false);
      }
    },

    async validateAndSaveApiKey(apiKey): Promise<boolean> {
      const normalizedApiKey = apiKey.trim();
      if (!normalizedApiKey || activeAccountId === null) {
        publishState(state.catalogStatus, 'key_required');
        return false;
      }

      pendingApiKey = normalizedApiKey;
      return loadCatalog(normalizedApiKey, true);
    },

    async retryCatalog(): Promise<boolean> {
      const apiKey = pendingApiKey ?? storedSettings?.apiKey ?? null;
      if (apiKey === null || activeAccountId === null) {
        return false;
      }

      return loadCatalog(apiKey, pendingApiKey !== null);
    },

    deleteConfiguration(): void {
      if (activeAccountId === null) {
        return;
      }

      abortRequest();
      try {
        settingsStore.clear(activeAccountId);
      } catch {
        publishState(state.catalogStatus, 'storage_error');
        return;
      }

      storedSettings = null;
      pendingApiKey = null;
      validatedCatalog = null;
      publishState('idle');
    },

    selectVisionModel(modelId): void {
      if (storedSettings === null || validatedCatalog === null) {
        return;
      }

      const normalizedModelId = normalizeModelId(modelId);
      if (
        normalizedModelId !== null &&
        !validatedCatalog.visionModels.some((model) => model.id === normalizedModelId)
      ) {
        return;
      }

      persistReadyUpdate({ ...storedSettings, visionModelId: normalizedModelId });
    },

    selectTransferModel(modelId): void {
      if (storedSettings === null || validatedCatalog === null) {
        return;
      }

      const normalizedModelId = normalizeModelId(modelId);
      if (
        normalizedModelId !== null &&
        !validatedCatalog.transferModels.some((model) => model.id === normalizedModelId)
      ) {
        return;
      }

      persistReadyUpdate({ ...storedSettings, transferModelId: normalizedModelId });
    },

    setTransferPrompt(prompt): void {
      if (storedSettings === null) {
        return;
      }

      const transferPromptOverride =
        prompt === DEFAULT_TRANSFER_DERIVATION_PROMPT.text ? null : prompt;
      persistReadyUpdate({ ...storedSettings, transferPromptOverride });
    },

    resetTransferPrompt(): void {
      if (storedSettings === null) {
        return;
      }
      persistReadyUpdate({ ...storedSettings, transferPromptOverride: null });
    },

    clearAfterLocalReset(): void {
      abortRequest();
      storedSettings = null;
      pendingApiKey = null;
      validatedCatalog = null;
      publishState('idle');
    },

    getReadyConfiguration(): ReadyOpenRouterReceiptConfiguration | null {
      if (state.catalogStatus !== 'ready' || validatedCatalog === null || storedSettings === null) {
        return null;
      }
      return toReadyOpenRouterReceiptConfiguration(storedSettings, validatedCatalog);
    },

    dispose(): void {
      abortRequest();
      activeAccountId = null;
      storedSettings = null;
      pendingApiKey = null;
      validatedCatalog = null;
      listeners.clear();
    },
  };

  return controller;
};
