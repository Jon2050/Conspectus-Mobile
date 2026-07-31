// Defines stored and currently validated OpenRouter receipt configuration contracts.
import type { OpenRouterCompatibleModelCatalog } from '@openrouter';

import {
  DEFAULT_TRANSFER_DERIVATION_PROMPT,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
} from './receiptPrompts';

export interface StoredOpenRouterReceiptSettings {
  readonly apiKey: string;
  readonly visionModelId: string | null;
  readonly transferModelId: string | null;
  readonly transferPromptOverride: string | null;
}

export interface ReadyOpenRouterReceiptConfiguration {
  readonly apiKey: string;
  readonly visionModelId: string;
  readonly transferModelId: string;
  readonly extractionPrompt: typeof RECEIPT_EXTRACTION_SYSTEM_PROMPT;
  readonly transferPrompt: string;
}

export const createEmptyOpenRouterReceiptSettings = (
  apiKey: string,
): StoredOpenRouterReceiptSettings => ({
  apiKey,
  visionModelId: null,
  transferModelId: null,
  transferPromptOverride: null,
});

export const resolveTransferDerivationPrompt = (
  settings: StoredOpenRouterReceiptSettings,
): string => settings.transferPromptOverride ?? DEFAULT_TRANSFER_DERIVATION_PROMPT.text;

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

export const toReadyOpenRouterReceiptConfiguration = (
  settings: StoredOpenRouterReceiptSettings,
  catalog: OpenRouterCompatibleModelCatalog,
): ReadyOpenRouterReceiptConfiguration | null => {
  const transferPrompt = resolveTransferDerivationPrompt(settings);
  if (
    !settings.apiKey.trim() ||
    !includesModel(catalog.visionModels, settings.visionModelId) ||
    !includesModel(catalog.transferModels, settings.transferModelId) ||
    !RECEIPT_EXTRACTION_SYSTEM_PROMPT.text.trim() ||
    !transferPrompt.trim()
  ) {
    return null;
  }

  return {
    apiKey: settings.apiKey,
    visionModelId: settings.visionModelId,
    transferModelId: settings.transferModelId,
    extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
    transferPrompt,
  };
};
