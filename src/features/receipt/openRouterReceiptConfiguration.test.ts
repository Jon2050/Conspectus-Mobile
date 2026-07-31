// Verifies model reconciliation, prompt overrides, and the complete receipt AI readiness contract.
import { describe, expect, it } from 'vitest';
import type { OpenRouterCompatibleModelCatalog } from '@openrouter';

import {
  reconcileOpenRouterModelSelections,
  resolveTransferDerivationPrompt,
  toReadyOpenRouterReceiptConfiguration,
  toStoredReadyOpenRouterReceiptConfiguration,
  type StoredOpenRouterReceiptSettings,
} from './openRouterReceiptConfiguration';
import { DEFAULT_TRANSFER_DERIVATION_PROMPT } from './receiptPrompts';

const settings = (overrides: Partial<StoredOpenRouterReceiptSettings> = {}) => ({
  apiKey: 'secret-key',
  visionModelId: 'shared-model',
  transferModelId: 'shared-model',
  transferPromptOverride: null,
  ...overrides,
});

const catalog = (visionIds = ['shared-model'], transferIds = ['shared-model']) =>
  ({
    visionModels: visionIds.map((id) => ({ id, name: id, label: id })),
    transferModels: transferIds.map((id) => ({ id, name: id, label: id })),
  }) satisfies OpenRouterCompatibleModelCatalog;

describe('OpenRouter receipt configuration', () => {
  it('clears invalid selections independently without choosing replacements', () => {
    expect(
      reconcileOpenRouterModelSelections(settings(), catalog(['other-vision'], ['shared-model'])),
    ).toEqual(settings({ visionModelId: null }));
    expect(
      reconcileOpenRouterModelSelections(settings(), catalog(['shared-model'], ['other-text'])),
    ).toEqual(settings({ transferModelId: null }));
  });

  it('uses the current default until a custom override is present', () => {
    expect(resolveTransferDerivationPrompt(settings())).toBe(
      DEFAULT_TRANSFER_DERIVATION_PROMPT.text,
    );
    expect(
      resolveTransferDerivationPrompt(settings({ transferPromptOverride: 'Custom rules' })),
    ).toBe('Custom rules');
  });

  it('allows the same eligible model for both roles and returns both internal prompts', () => {
    expect(toReadyOpenRouterReceiptConfiguration(settings(), catalog())).toMatchObject({
      apiKey: 'secret-key',
      visionModelId: 'shared-model',
      transferModelId: 'shared-model',
      transferPrompt: DEFAULT_TRANSFER_DERIVATION_PROMPT.text,
      extractionPrompt: { version: 1 },
    });
  });

  it('resolves previously validated stored settings for the capture handoff', () => {
    expect(toStoredReadyOpenRouterReceiptConfiguration(settings())).toMatchObject({
      apiKey: 'secret-key',
      visionModelId: 'shared-model',
      transferModelId: 'shared-model',
      extractionPrompt: { version: 1 },
    });
    expect(
      toStoredReadyOpenRouterReceiptConfiguration(settings({ visionModelId: null })),
    ).toBeNull();
  });

  it.each([
    settings({ apiKey: ' ' }),
    settings({ visionModelId: null }),
    settings({ transferModelId: null }),
    settings({ transferPromptOverride: ' ' }),
  ])('is not ready when any required configuration value is missing', (candidate) => {
    expect(toReadyOpenRouterReceiptConfiguration(candidate, catalog())).toBeNull();
  });

  it('is not ready when either saved model is absent from the current role catalog', () => {
    expect(
      toReadyOpenRouterReceiptConfiguration(settings(), catalog([], ['shared-model'])),
    ).toBeNull();
    expect(
      toReadyOpenRouterReceiptConfiguration(settings(), catalog(['shared-model'], [])),
    ).toBeNull();
  });
});
