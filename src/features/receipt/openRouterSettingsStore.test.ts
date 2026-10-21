// Verifies schema-versioned account isolation and deletion for locally stored receipt AI settings.
import { describe, expect, it } from 'vitest';

import { toStoredReadyOpenRouterReceiptConfiguration } from './openRouterReceiptConfiguration';
import type { StoredOpenRouterReceiptSettings } from './openRouterReceiptConfiguration';
import {
  OpenRouterSettingsStorageError,
  createOpenRouterSettingsStore,
} from './openRouterSettingsStore';

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  };
};

const settings = (apiKey: string, modelId: string): StoredOpenRouterReceiptSettings => ({
  apiKey,
  visionModelId: modelId,
  transferModelId: modelId,
  transferRulesOverride: `- Rules for ${modelId} [Category]`,
});

describe('createOpenRouterSettingsStore', () => {
  it('persists a versioned payload and isolates configurations by Microsoft account', () => {
    const { storage, values } = createMemoryStorage();
    const store = createOpenRouterSettingsStore({ storage, storageKey: 'settings-key' });
    const accountOne = settings('secret-one', 'model-one');
    const accountTwo = settings('secret-two', 'model-two');

    store.write('account-one', accountOne);
    store.write('account-two', accountTwo);

    expect(store.read('account-one')).toEqual(accountOne);
    expect(store.read('account-two')).toEqual(accountTwo);
    expect(JSON.parse(values.get('settings-key') ?? '')).toEqual({
      version: 2,
      settingsByAccountId: {
        'account-one': accountOne,
        'account-two': accountTwo,
      },
    });
  });

  it('reads schema 1 without discarding selections, writes schema 2 on the next update', () => {
    const { storage, values } = createMemoryStorage();
    const original = settings('secret', 'model');
    values.set(
      'settings-key',
      JSON.stringify({ version: 1, settingsByAccountId: { one: original } }),
    );
    const store = createOpenRouterSettingsStore({ storage, storageKey: 'settings-key' });
    expect(store.read('one')).toEqual(original);
    const ready = toStoredReadyOpenRouterReceiptConfiguration(store.read('one')!);
    expect(ready).not.toBeNull();
    expect(ready?.visionReasoning).toBeUndefined();
    expect(ready?.transferReasoning).toBeUndefined();
    store.write('two', settings('other-secret', 'other-model'));
    expect(JSON.parse(values.get('settings-key')!).version).toBe(2);
    expect(store.read('one')).toEqual(original);
  });

  it('preserves minimum and binary reasoning after restart for each account and role', () => {
    const { storage } = createMemoryStorage();
    const store = createOpenRouterSettingsStore({ storage });
    const one = {
      ...settings('one-secret', 'model'),
      visionReasoning: {
        modelId: 'model',
        capabilities: {
          mandatory: false,
          supportedEfforts: ['high', 'minimal', 'none'] as const,
          defaultEnabled: false,
        },
      },
      transferReasoning: { modelId: 'model', capabilities: { mandatory: true } },
    };
    store.write('one', one);
    store.write('two', settings('two-secret', 'other'));
    const restarted = createOpenRouterSettingsStore({ storage });
    expect(toStoredReadyOpenRouterReceiptConfiguration(restarted.read('one')!)).toMatchObject({
      visionReasoning: { enabled: true, effort: 'minimal' },
      transferReasoning: { enabled: true },
    });
    expect(
      toStoredReadyOpenRouterReceiptConfiguration(restarted.read('two')!)?.visionReasoning,
    ).toBeUndefined();
  });

  it('drops only damaged or mismatched capability snapshots, keeping valid settings', () => {
    const { storage, values } = createMemoryStorage();
    for (const capabilities of [
      { mandatory: 'yes' },
      { mandatory: false, supportedEfforts: ['invented'] },
    ]) {
      values.set(
        'settings-key',
        JSON.stringify({
          version: 2,
          settingsByAccountId: {
            one: {
              ...settings('secret', 'model'),
              visionReasoning: { modelId: 'model', capabilities },
              transferReasoning: { modelId: 'other', capabilities: { mandatory: true } },
            },
          },
        }),
      );
      const read = createOpenRouterSettingsStore({ storage, storageKey: 'settings-key' }).read(
        'one',
      );
      expect(read).toEqual(settings('secret', 'model'));
    }
  });

  it('deletes only the requested account and removes storage after the final deletion', () => {
    const { storage, values } = createMemoryStorage();
    const store = createOpenRouterSettingsStore({ storage, storageKey: 'settings-key' });
    store.write('account-one', settings('secret-one', 'model-one'));
    store.write('account-two', settings('secret-two', 'model-two'));

    store.clear('account-one');
    expect(store.read('account-one')).toBeNull();
    expect(store.read('account-two')).toMatchObject({ apiKey: 'secret-two' });

    store.clear('account-two');
    expect(values.has('settings-key')).toBe(false);
  });

  it('ignores malformed or unsupported payloads and overwrites them on save', () => {
    const { storage, values } = createMemoryStorage();
    values.set('settings-key', JSON.stringify({ version: 99, settingsByAccountId: {} }));
    const store = createOpenRouterSettingsStore({ storage, storageKey: 'settings-key' });

    expect(store.read('account-one')).toBeNull();
    store.write('account-one', settings('secret-one', 'model-one'));
    expect(store.read('account-one')).toMatchObject({ apiKey: 'secret-one' });
  });

  it('fails with a fixed key-safe error when storage is unavailable', () => {
    const store = createOpenRouterSettingsStore({ storage: null });

    expect(() => store.write('account-one', settings('secret-api-key', 'model'))).toThrow(
      OpenRouterSettingsStorageError,
    );
    expect(() => store.write('account-one', settings('secret-api-key', 'model'))).toThrow(
      'OpenRouter settings could not be stored on this device.',
    );
  });

  it('rejects blank account IDs and invalid settings', () => {
    const { storage } = createMemoryStorage();
    const store = createOpenRouterSettingsStore({ storage });

    expect(() => store.read(' ')).toThrow(OpenRouterSettingsStorageError);
    expect(() => store.write('account', settings('', 'model'))).toThrow(
      OpenRouterSettingsStorageError,
    );
  });
});
