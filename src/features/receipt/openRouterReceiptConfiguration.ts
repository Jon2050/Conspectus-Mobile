// Defines stored and currently validated OpenRouter receipt configuration contracts.
import type { OpenRouterCompatibleModelCatalog } from '@openrouter';

import {
  DEFAULT_TRANSFER_DERIVATION_RULES,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  TRANSFER_DERIVATION_SYSTEM_PROMPT,
} from './prompts';

export interface StoredOpenRouterReceiptSettings {
  readonly apiKey: string;
  readonly visionModelId: string | null;
  readonly transferModelId: string | null;
  readonly transferRulesOverride: string | null;
}

export interface ReadyOpenRouterReceiptConfiguration {
  readonly apiKey: string;
  readonly visionModelId: string;
  readonly transferModelId: string;
  readonly extractionPrompt: typeof RECEIPT_EXTRACTION_SYSTEM_PROMPT;
  readonly transferPrompt: typeof TRANSFER_DERIVATION_SYSTEM_PROMPT;
  readonly transferRules: string;
}

export const createEmptyOpenRouterReceiptSettings = (
  apiKey: string,
): StoredOpenRouterReceiptSettings => ({
  apiKey,
  visionModelId: null,
  transferModelId: null,
  transferRulesOverride: null,
});

export const resolveTransferDerivationRules = (settings: StoredOpenRouterReceiptSettings): string =>
  settings.transferRulesOverride ?? DEFAULT_TRANSFER_DERIVATION_RULES.text;

const includesModel = (
  models: OpenRouterCompatibleModelCatalog['visionModels'],
  modelId: string | null,
): modelId is string => modelId !== null && models.some((model) => model.id === modelId);

export const reconcileOpenRouterModelSelections = (
  settings: StoredOpenRouterReceiptSettings,
  catalog: OpenRouterCompatibleModelCatalog,
): StoredOpenRouterReceiptSettings => ({
  ...settings,
  visionModelId: includesModel(catalog.visionModels, settings.visionModelId)
    ? settings.visionModelId
    : null,
  transferModelId: includesModel(catalog.transferModels, settings.transferModelId)
    ? settings.transferModelId
    : null,
});

export const toStoredReadyOpenRouterReceiptConfiguration = (
  settings: StoredOpenRouterReceiptSettings,
): ReadyOpenRouterReceiptConfiguration | null => {
  const transferRules = resolveTransferDerivationRules(settings);
  if (
    !settings.apiKey.trim() ||
    settings.visionModelId === null ||
    settings.transferModelId === null ||
    !RECEIPT_EXTRACTION_SYSTEM_PROMPT.text.trim() ||
    !TRANSFER_DERIVATION_SYSTEM_PROMPT.text.trim() ||
    !transferRules.trim()
  ) {
    return null;
  }

  return {
    apiKey: settings.apiKey,
    visionModelId: settings.visionModelId,
    transferModelId: settings.transferModelId,
    extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
    transferPrompt: TRANSFER_DERIVATION_SYSTEM_PROMPT,
    transferRules,
  };
};

export const toReadyOpenRouterReceiptConfiguration = (
  settings: StoredOpenRouterReceiptSettings,
  catalog: OpenRouterCompatibleModelCatalog,
): ReadyOpenRouterReceiptConfiguration | null => {
  if (
    !includesModel(catalog.visionModels, settings.visionModelId) ||
    !includesModel(catalog.transferModels, settings.transferModelId)
  ) {
    return null;
  }

  return toStoredReadyOpenRouterReceiptConfiguration(settings);
};
