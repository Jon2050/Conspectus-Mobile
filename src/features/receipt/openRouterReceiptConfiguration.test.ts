// Verifies model reconciliation, prompt overrides, and the complete receipt AI readiness contract.
import { describe, expect, it } from 'vitest';
import type { OpenRouterCompatibleModelCatalog } from '@openrouter';

import {
  reconcileOpenRouterModelSelections,
  resolveTransferDerivationRules,
  toReadyOpenRouterReceiptConfiguration,
  toStoredReadyOpenRouterReceiptConfiguration,
  type StoredOpenRouterReceiptSettings,
} from './openRouterReceiptConfiguration';
import { DEFAULT_TRANSFER_DERIVATION_RULES } from './prompts';

const settings = (overrides: Partial<StoredOpenRouterReceiptSettings> = {}) => ({
  apiKey: 'secret-key',
  visionModelId: 'shared-model',
  transferModelId: 'shared-model',
  transferRulesOverride: null,
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
    expect(resolveTransferDerivationRules(settings())).toBe(DEFAULT_TRANSFER_DERIVATION_RULES.text);
    expect(
      resolveTransferDerivationRules(
        settings({
          transferRulesOverride: '- Custom group with category [Custom].',
        }),
      ),
    ).toBe('- Custom group with category [Custom].');
  });

  it('treats non-empty custom grouping rules as opaque prompt text', () => {
    const opaqueRules = 'Free-form instructions without app-readable category declarations.';
    expect(
      toReadyOpenRouterReceiptConfiguration(
        settings({ transferRulesOverride: opaqueRules }),
        catalog(),
      ),
    ).toMatchObject({ transferRules: opaqueRules });
  });

  it('allows the same eligible model for both roles and returns both internal prompts', () => {
    expect(toReadyOpenRouterReceiptConfiguration(settings(), catalog())).toMatchObject({
      apiKey: 'secret-key',
      visionModelId: 'shared-model',
      transferModelId: 'shared-model',
      transferPrompt: { version: 3 },
      transferRules: DEFAULT_TRANSFER_DERIVATION_RULES.text,
      extractionPrompt: { version: 3 },
    });
  });

  it('resolves previously validated stored settings for the capture handoff', () => {
    expect(toStoredReadyOpenRouterReceiptConfiguration(settings())).toMatchObject({
      apiKey: 'secret-key',
      visionModelId: 'shared-model',
      transferModelId: 'shared-model',
      extractionPrompt: { version: 3 },
    });
    expect(
      toStoredReadyOpenRouterReceiptConfiguration(settings({ visionModelId: null })),
    ).toBeNull();
  });

  it.each([
    settings({ apiKey: ' ' }),
    settings({ visionModelId: null }),
    settings({ transferModelId: null }),
    settings({ transferRulesOverride: ' ' }),
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
