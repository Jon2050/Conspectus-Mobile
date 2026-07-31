// Verifies Settings orchestration for validation, reconciliation, retries, isolation, and secrecy.
import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterCatalogError,
  type OpenRouterCompatibleModelCatalog,
  type OpenRouterModelCatalogClient,
} from '@openrouter';

import {
  createOpenRouterSettingsStore,
  type OpenRouterSettingsStore,
  type StoredOpenRouterReceiptSettings,
} from '../../receipt';
import { createSettingsOpenRouterController } from './settingsOpenRouterController';

const compatibleCatalog = (
  visionIds = ['shared-model'],
  transferIds = ['shared-model'],
): OpenRouterCompatibleModelCatalog => ({
  visionModels: visionIds.map((id) => ({ id, name: `Name ${id}`, label: `Name ${id} — ${id}` })),
  transferModels: transferIds.map((id) => ({
    id,
    name: `Name ${id}`,
    label: `Name ${id} — ${id}`,
  })),
});

const storedSettings = (
  overrides: Partial<StoredOpenRouterReceiptSettings> = {},
): StoredOpenRouterReceiptSettings => ({
  apiKey: 'saved-secret-key',
  visionModelId: 'shared-model',
  transferModelId: 'shared-model',
  transferPromptOverride: 'Custom prompt',
  ...overrides,
});

const createStore = (): OpenRouterSettingsStore => {
  const values = new Map<string, string>();
  return createOpenRouterSettingsStore({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
  });
};

const createClient = (
  load: OpenRouterModelCatalogClient['load'],
): OpenRouterModelCatalogClient => ({
  load,
});

describe('createSettingsOpenRouterController', () => {
  it('keeps controls empty until a new key validates, then never exposes that key in state', async () => {
    const settingsStore = createStore();
    const load = vi.fn(async () => compatibleCatalog());
    const controller = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(load),
    });
    await controller.activateAccount('account-one');

    expect(controller.getState()).toMatchObject({
      catalogStatus: 'idle',
      hasStoredApiKey: false,
      visionModels: [],
      transferModels: [],
    });

    await expect(controller.validateAndSaveApiKey('new-secret-key')).resolves.toBe(true);
    expect(load).toHaveBeenCalledWith('new-secret-key', expect.any(AbortSignal));
    expect(controller.getState()).toMatchObject({
      catalogStatus: 'ready',
      hasStoredApiKey: true,
      selectedVisionModelId: null,
      selectedTransferModelId: null,
      configurationIsReady: false,
    });
    expect(JSON.stringify(controller.getState())).not.toContain('new-secret-key');
    expect(settingsStore.read('account-one')).toMatchObject({ apiKey: 'new-secret-key' });
  });

  it('supports the same model in both roles plus custom and reset prompt readiness', async () => {
    const settingsStore = createStore();
    const controller = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(async () => compatibleCatalog()),
    });
    await controller.activateAccount('account-one');
    await controller.validateAndSaveApiKey('new-secret-key');

    controller.selectVisionModel('shared-model');
    controller.selectTransferModel('shared-model');
    expect(controller.getState().configurationIsReady).toBe(true);
    expect(controller.getReadyConfiguration()).toMatchObject({
      visionModelId: 'shared-model',
      transferModelId: 'shared-model',
    });

    controller.setTransferPrompt('  ');
    expect(controller.getState().configurationIsReady).toBe(false);
    controller.setTransferPrompt('My groups and categories');
    expect(controller.getState().configurationIsReady).toBe(true);
    expect(settingsStore.read('account-one')?.transferPromptOverride).toBe(
      'My groups and categories',
    );

    controller.resetTransferPrompt();
    expect(controller.getState()).toMatchObject({
      transferPromptUsesDefault: true,
      configurationIsReady: true,
    });
    expect(settingsStore.read('account-one')?.transferPromptOverride).toBeNull();
  });

  it('starts a fresh saved-key catalog request for each new Settings controller', async () => {
    const settingsStore = createStore();
    settingsStore.write('account-one', storedSettings());
    const load = vi.fn(async () => compatibleCatalog());

    const firstController = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(load),
    });
    await firstController.activateAccount('account-one');
    firstController.dispose();

    const secondController = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(load),
    });
    await secondController.activateAccount('account-one');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('clears newly ineligible selections only after a successful authoritative refresh', async () => {
    const settingsStore = createStore();
    settingsStore.write('account-one', storedSettings());
    const controller = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(async () => compatibleCatalog(['new-vision'], ['shared-model'])),
    });

    await controller.activateAccount('account-one');

    expect(controller.getState()).toMatchObject({
      catalogStatus: 'ready',
      selectedVisionModelId: null,
      selectedTransferModelId: 'shared-model',
    });
    expect(settingsStore.read('account-one')).toMatchObject({
      visionModelId: null,
      transferModelId: 'shared-model',
    });
  });

  it.each([
    ['invalid_key', 'invalid_key'],
    ['network_error', 'network_error'],
    ['provider_error', 'provider_error'],
    ['invalid_response', 'invalid_response'],
  ] as const)(
    'keeps stored IDs internally and disables visible choices after a %s failure',
    async (errorCode, expectedStatus) => {
      const settingsStore = createStore();
      settingsStore.write('account-one', storedSettings());
      const controller = createSettingsOpenRouterController({
        settingsStore,
        catalogClient: createClient(async () => {
          throw new OpenRouterCatalogError(errorCode);
        }),
      });

      await controller.activateAccount('account-one');

      expect(controller.getState()).toMatchObject({
        catalogStatus: expectedStatus,
        visionModels: [],
        transferModels: [],
        selectedVisionModelId: null,
        selectedTransferModelId: null,
      });
      expect(settingsStore.read('account-one')).toEqual(storedSettings());
    },
  );

  it('retries a transient replacement without overwriting the prior saved key first', async () => {
    const settingsStore = createStore();
    settingsStore.write('account-one', storedSettings());
    const load = vi
      .fn<OpenRouterModelCatalogClient['load']>()
      .mockResolvedValueOnce(compatibleCatalog())
      .mockRejectedValueOnce(new OpenRouterCatalogError('network_error'))
      .mockResolvedValueOnce(compatibleCatalog());
    const controller = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(load),
    });
    await controller.activateAccount('account-one');

    await controller.validateAndSaveApiKey('replacement-secret-key');
    expect(settingsStore.read('account-one')?.apiKey).toBe('saved-secret-key');

    await controller.retryCatalog();
    expect(settingsStore.read('account-one')?.apiKey).toBe('replacement-secret-key');
  });

  it('isolates account state and ignores an older request after an account switch', async () => {
    const settingsStore = createStore();
    settingsStore.write('account-one', storedSettings({ apiKey: 'secret-one' }));
    settingsStore.write('account-two', storedSettings({ apiKey: 'secret-two' }));
    let resolveFirst: (catalog: OpenRouterCompatibleModelCatalog) => void = () => {};
    const firstCatalog = new Promise<OpenRouterCompatibleModelCatalog>((resolve) => {
      resolveFirst = resolve;
    });
    const load = vi.fn(async (apiKey: string) =>
      apiKey === 'secret-one' ? firstCatalog : compatibleCatalog(),
    );
    const controller = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(load),
    });

    const firstActivation = controller.activateAccount('account-one');
    await controller.activateAccount('account-two');
    resolveFirst(compatibleCatalog(['wrong-model'], ['wrong-model']));
    await firstActivation;

    expect(controller.getReadyConfiguration()?.apiKey).toBe('secret-two');
    expect(controller.getState().selectedVisionModelId).toBe('shared-model');
  });

  it('deletes only the active configuration and clears in-memory state after local reset', async () => {
    const settingsStore = createStore();
    settingsStore.write('account-one', storedSettings({ apiKey: 'secret-one' }));
    settingsStore.write('account-two', storedSettings({ apiKey: 'secret-two' }));
    const controller = createSettingsOpenRouterController({
      settingsStore,
      catalogClient: createClient(async () => compatibleCatalog()),
    });
    await controller.activateAccount('account-one');

    controller.deleteConfiguration();
    expect(settingsStore.read('account-one')).toBeNull();
    expect(settingsStore.read('account-two')).toMatchObject({ apiKey: 'secret-two' });
    expect(controller.getState()).toMatchObject({ catalogStatus: 'idle', hasStoredApiKey: false });

    await controller.validateAndSaveApiKey('new-secret-one');
    controller.clearAfterLocalReset();
    expect(controller.getState()).toMatchObject({ catalogStatus: 'idle', hasStoredApiKey: false });
    expect(JSON.stringify(controller.getState())).not.toContain('new-secret-one');
  });
});
