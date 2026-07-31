// Exposes receipt AI settings contracts to feature-level Settings and future receipt workflows.
export { DEFAULT_TRANSFER_DERIVATION_PROMPT } from './receiptPrompts';
export type { VersionedReceiptPrompt } from './receiptPrompts';
export { createReceiptAnalysisController } from './receiptAnalysisController';
export type {
  ReceiptAnalysisController,
  ReceiptAnalysisErrorCode,
  ReceiptAnalysisPhase,
  ReceiptAnalysisStage,
  ReceiptAnalysisState,
} from './receiptAnalysisController';
export {
  createEmptyOpenRouterReceiptSettings,
  reconcileOpenRouterModelSelections,
  resolveTransferDerivationPrompt,
  toReadyOpenRouterReceiptConfiguration,
  toStoredReadyOpenRouterReceiptConfiguration,
} from './openRouterReceiptConfiguration';
export type {
  ReadyOpenRouterReceiptConfiguration,
  StoredOpenRouterReceiptSettings,
} from './openRouterReceiptConfiguration';
export { createOpenRouterSettingsStore, openRouterSettingsStore } from './openRouterSettingsStore';
export type {
  OpenRouterSettingsStorageAdapter,
  OpenRouterSettingsStore,
} from './openRouterSettingsStore';
export { browserReceiptImageCodec } from './browserReceiptImageCodec';
export { createReceiptImageNormalizer } from './receiptImageNormalization';
export { createReceiptCaptureController } from './receiptCaptureController';
export type {
  ReceiptCaptureController,
  ReceiptCaptureErrorCode,
  ReceiptCapturePhase,
  ReceiptCaptureState,
  ReceiptStageOneStarter,
  ReceiptStageOneStartInput,
} from './receiptCaptureController';
