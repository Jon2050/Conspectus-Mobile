// Orchestrates one abortable two-stage receipt analysis without persisting provider inputs or results.
import {
  OpenRouterCatalogError,
  OpenRouterChatCompletionError,
  openRouterChatCompletionClient,
  openRouterModelCatalogClient,
  type OpenRouterChatCompletionClient,
  type OpenRouterModelCatalogClient,
} from '@openrouter';

import {
  RECEIPT_TRANSFER_DERIVATION_JSON_SCHEMA,
  parseReceiptExtractionResponse,
  parseReceiptTransferDerivationResponse,
  type ReceiptExtraction,
  type ReceiptTransferDerivation,
} from './receiptAnalysisContracts';
import { disposeNormalizedReceiptImage } from './receiptImageNormalization';
import {
  RECEIPT_EXTRACTION_IMAGE_INSTRUCTION,
  TRANSFER_DERIVATION_EXTRACTION_HEADING,
  TRANSFER_DERIVATION_RULES_HEADING,
} from './prompts';
import type { ReceiptStageOneStartInput, ReceiptStageOneStarter } from './receiptCaptureController';

export type ReceiptAnalysisPhase = 'idle' | 'extracting' | 'deriving' | 'succeeded' | 'error';

export type ReceiptAnalysisErrorCode =
  | 'model_unavailable'
  | 'auth_error'
  | 'rate_limited'
  | 'network_error'
  | 'timeout'
  | 'refusal'
  | 'provider_error'
  | 'invalid_response'
  | 'output_limit'
  | 'model_error';

export type ReceiptAnalysisStage = 'extraction' | 'derivation';

export interface ReceiptAnalysisState {
  readonly phase: ReceiptAnalysisPhase;
  readonly stage: ReceiptAnalysisStage | null;
  readonly errorCode: ReceiptAnalysisErrorCode | null;
  readonly errorReason: string | null;
  readonly derivation: ReceiptTransferDerivation | null;
  readonly extractedItemIndexes: readonly number[] | null;
}

class ReceiptAnalysisError extends Error {
  constructor(
    readonly code: ReceiptAnalysisErrorCode,
    readonly stage: ReceiptAnalysisStage,
    readonly reason: string | null = null,
  ) {
    super(`Receipt ${stage} failed (${code}).`);
    this.name = 'ReceiptAnalysisError';
  }
}

export interface ReceiptAnalysisController extends ReceiptStageOneStarter {
  getState(): ReceiptAnalysisState;
  subscribe(listener: (state: ReceiptAnalysisState) => void): () => void;
  reset(): void;
  dispose(): void;
}

interface CreateReceiptAnalysisControllerOptions {
  readonly catalogClient?: OpenRouterModelCatalogClient;
  readonly completionClient?: OpenRouterChatCompletionClient;
}

const INITIAL_STATE: ReceiptAnalysisState = {
  phase: 'idle',
  stage: null,
  errorCode: null,
  errorReason: null,
  derivation: null,
  extractedItemIndexes: null,
};

const createAbortError = (): DOMException =>
  new DOMException('Receipt analysis was cancelled.', 'AbortError');

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const toBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const hasModel = (models: readonly { readonly id: string }[], modelId: string): boolean =>
  models.some((model) => model.id === modelId);

const toCatalogAnalysisError = (
  error: OpenRouterCatalogError,
  stage: ReceiptAnalysisStage,
): ReceiptAnalysisError => {
  switch (error.code) {
    case 'invalid_key':
      return new ReceiptAnalysisError('auth_error', stage);
    case 'network_error':
      return new ReceiptAnalysisError('network_error', stage);
    case 'invalid_response':
      return new ReceiptAnalysisError('invalid_response', stage);
    case 'provider_error':
      return new ReceiptAnalysisError('provider_error', stage);
    case 'aborted':
      throw createAbortError();
  }
};

const toCompletionAnalysisError = (
  error: OpenRouterChatCompletionError,
  stage: ReceiptAnalysisStage,
): ReceiptAnalysisError => {
  const codeByProviderCode = {
    auth_error: 'auth_error',
    rate_limited: 'rate_limited',
    network_error: 'network_error',
    timeout: 'timeout',
    refusal: 'refusal',
    provider_error: 'provider_error',
    invalid_response: 'invalid_response',
    over_limit: 'output_limit',
  } as const;

  return new ReceiptAnalysisError(codeByProviderCode[error.code], stage);
};

const toAnalysisError = (error: unknown, stage: ReceiptAnalysisStage): ReceiptAnalysisError => {
  if (error instanceof ReceiptAnalysisError) {
    return error;
  }
  if (error instanceof OpenRouterCatalogError) {
    return toCatalogAnalysisError(error, stage);
  }
  if (error instanceof OpenRouterChatCompletionError) {
    return toCompletionAnalysisError(error, stage);
  }
  return new ReceiptAnalysisError('invalid_response', stage);
};

export const createReceiptAnalysisController = (
  options: CreateReceiptAnalysisControllerOptions = {},
): ReceiptAnalysisController => {
  const catalogClient = options.catalogClient ?? openRouterModelCatalogClient;
  const completionClient = options.completionClient ?? openRouterChatCompletionClient;
  const listeners = new Set<(state: ReceiptAnalysisState) => void>();
  let state = INITIAL_STATE;
  let activeRunId = 0;
  let activeAbortController: AbortController | null = null;
  let isDisposed = false;

  const publish = (nextState: ReceiptAnalysisState): void => {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const cancelActiveRun = (): void => {
    activeRunId += 1;
    activeAbortController?.abort();
    activeAbortController = null;
  };

  const reset = (): void => {
    cancelActiveRun();
    if (!isDisposed) {
      publish(INITIAL_STATE);
    }
  };

  const assertActive = (runId: number, signal: AbortSignal): void => {
    if (isDisposed || runId !== activeRunId || signal.aborted) {
      throw createAbortError();
    }
  };

  const publishError = (runId: number, error: ReceiptAnalysisError): void => {
    if (runId !== activeRunId || isDisposed) {
      return;
    }
    activeAbortController = null;
    publish({
      phase: 'error',
      stage: error.stage,
      errorCode: error.code,
      errorReason: error.reason,
      derivation: null,
      extractedItemIndexes: null,
    });
  };

  return {
    getState: () => state,

    subscribe(listener): () => void {
      if (isDisposed) {
        listener(INITIAL_STATE);
        return () => {};
      }
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },

    async start(input: ReceiptStageOneStartInput, outerSignal: AbortSignal): Promise<void> {
      if (isDisposed) {
        throw createAbortError();
      }

      cancelActiveRun();
      const runId = activeRunId;
      const abortController = new AbortController();
      activeAbortController = abortController;
      const abortFromOuter = (): void => abortController.abort();
      outerSignal.addEventListener('abort', abortFromOuter, { once: true });
      if (outerSignal.aborted) {
        abortController.abort();
      }
      publish({ ...INITIAL_STATE, phase: 'extracting', stage: 'extraction' });

      let extraction: ReceiptExtraction;
      try {
        try {
          const catalog = await catalogClient.load(
            input.configuration.apiKey,
            abortController.signal,
          );
          assertActive(runId, abortController.signal);
          if (!hasModel(catalog.visionModels, input.configuration.visionModelId)) {
            throw new ReceiptAnalysisError('model_unavailable', 'extraction');
          }

          const rawExtraction = await completionClient.complete(
            {
              apiKey: input.configuration.apiKey,
              model: input.configuration.visionModelId,
              messages: [
                {
                  role: 'system',
                  content: input.configuration.extractionPrompt.text,
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: RECEIPT_EXTRACTION_IMAGE_INSTRUCTION,
                    },
                    { type: 'image/jpeg', base64: toBase64(input.image.bytes) },
                  ],
                },
              ],
            },
            abortController.signal,
          );
          assertActive(runId, abortController.signal);
          const parsedExtraction = parseReceiptExtractionResponse(rawExtraction);
          if (!parsedExtraction.ok) {
            throw new ReceiptAnalysisError(
              parsedExtraction.error.code === 'OUTPUT_TOO_LARGE'
                ? 'output_limit'
                : 'invalid_response',
              'extraction',
            );
          }
          if (parsedExtraction.value.status === 'error') {
            throw new ReceiptAnalysisError(
              'model_error',
              'extraction',
              parsedExtraction.value.errorReason,
            );
          }
          extraction = parsedExtraction.value;
        } finally {
          disposeNormalizedReceiptImage(input.image);
        }

        assertActive(runId, abortController.signal);
        publish({ ...INITIAL_STATE, phase: 'deriving', stage: 'derivation' });

        const transferCatalog = await catalogClient.load(
          input.configuration.apiKey,
          abortController.signal,
        );
        assertActive(runId, abortController.signal);
        if (!hasModel(transferCatalog.transferModels, input.configuration.transferModelId)) {
          throw new ReceiptAnalysisError('model_unavailable', 'derivation');
        }

        const rawDerivation = await completionClient.complete(
          {
            apiKey: input.configuration.apiKey,
            model: input.configuration.transferModelId,
            messages: [
              { role: 'system', content: input.configuration.transferPrompt.text },
              {
                role: 'user',
                content:
                  TRANSFER_DERIVATION_RULES_HEADING +
                  '\n' +
                  input.configuration.transferRules +
                  '\n\n' +
                  TRANSFER_DERIVATION_EXTRACTION_HEADING +
                  '\n' +
                  JSON.stringify(extraction),
              },
            ],
            responseFormat: {
              name: RECEIPT_TRANSFER_DERIVATION_JSON_SCHEMA.name,
              schema: RECEIPT_TRANSFER_DERIVATION_JSON_SCHEMA.schema,
            },
          },
          abortController.signal,
        );
        assertActive(runId, abortController.signal);
        const parsedDerivation = parseReceiptTransferDerivationResponse(rawDerivation, extraction);
        if (!parsedDerivation.ok) {
          throw new ReceiptAnalysisError(
            parsedDerivation.error.code === 'OUTPUT_TOO_LARGE'
              ? 'output_limit'
              : 'invalid_response',
            'derivation',
          );
        }
        if (parsedDerivation.value.status === 'error') {
          throw new ReceiptAnalysisError(
            'model_error',
            'derivation',
            parsedDerivation.value.errorReason,
          );
        }

        assertActive(runId, abortController.signal);
        activeAbortController = null;
        publish({
          phase: 'succeeded',
          stage: null,
          errorCode: null,
          errorReason: null,
          derivation: parsedDerivation.value,
          extractedItemIndexes: Object.freeze(extraction.items.map((item) => item.index)),
        });
      } catch (error) {
        if (
          isAbortError(error) ||
          abortController.signal.aborted ||
          outerSignal.aborted ||
          runId !== activeRunId ||
          isDisposed
        ) {
          throw createAbortError();
        }
        const stage = state.stage ?? 'extraction';
        const analysisError = toAnalysisError(error, stage);
        publishError(runId, analysisError);
        throw analysisError;
      } finally {
        outerSignal.removeEventListener('abort', abortFromOuter);
        if (runId === activeRunId && activeAbortController === abortController) {
          activeAbortController = null;
        }
      }
    },

    reset,

    dispose(): void {
      if (isDisposed) {
        return;
      }
      cancelActiveRun();
      isDisposed = true;
      state = INITIAL_STATE;
      listeners.clear();
    },
  };
};
