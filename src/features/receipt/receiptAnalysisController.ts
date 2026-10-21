// Orchestrates one abortable two-stage receipt analysis without persisting provider inputs or results.
import {
  OpenRouterChatCompletionError,
  openRouterChatCompletionClient,
  type OpenRouterChatCompletionClient,
} from '@openrouter';

import {
  parseReceiptExtractionResponse,
  parseReceiptTransferDerivationResponse,
  type ReceiptExtractionResult,
  type ReceiptReviewSeed,
  type ReceiptTransferDerivation,
} from './receiptAnalysisContracts';
import { disposeNormalizedReceiptImage } from './receiptImageNormalization';
import { receiptExtractionMessages, receiptDerivationMessages } from './receiptAnalysisMessages';
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
  readonly review?: ReceiptReviewSeed | null;
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
  readonly completionClient?: OpenRouterChatCompletionClient;
}

const INITIAL_STATE: ReceiptAnalysisState = {
  phase: 'idle',
  stage: null,
  errorCode: null,
  errorReason: null,
  derivation: null,
  review: null,
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

const reviewSeed = (
  extraction: ReceiptExtractionResult,
  derivation?: ReturnType<typeof parseReceiptTransferDerivationResponse>,
): ReceiptReviewSeed => {
  const result = derivation?.ok ? derivation.value : null;
  return {
    receiptDate: extraction.receiptDate,
    currency: extraction.currency,
    buyplace:
      result?.status === 'error'
        ? (result.buyplace ?? extraction.storeName)
        : (result?.transfers[0]?.buyplace ?? extraction.storeName),
    receiptTotalCents: extraction.receiptTotalCents,
    transfers:
      result?.transfers.map((transfer) => ({
        ...transfer,
        items: extraction.items
          .filter((item) => transfer.sourceItemIndexes.includes(item.index))
          .map(({ index, name, lineTotalCents }) => ({ index, name, lineTotalCents })),
      })) ?? [],
  };
};

// A model's mistaken "ok" is never accepted as successful. Bounded, typed suggestions can
// still populate the manual review after arithmetic/coverage validation has rejected them.
const recoverReviewSeed = (
  raw: string,
  extraction?: ReceiptExtractionResult,
): ReceiptReviewSeed | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const partial = JSON.stringify({
      ...value,
      status: 'error',
      errorReason: 'Local validation rejected a complete response.',
    });
    if (extraction) {
      const parsed = parseReceiptTransferDerivationResponse(partial, extraction);
      return parsed.ok ? reviewSeed(extraction, parsed) : null;
    }
    const parsed = parseReceiptExtractionResponse(partial);
    return parsed.ok ? reviewSeed(parsed.value) : null;
  } catch {
    return null;
  }
};

const toCompletionAnalysisError = (
  error: OpenRouterChatCompletionError,
  stage: ReceiptAnalysisStage,
): ReceiptAnalysisError => {
  const codeByProviderCode = {
    model_unavailable: 'model_unavailable',
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
  if (error instanceof OpenRouterChatCompletionError) {
    return toCompletionAnalysisError(error, stage);
  }
  return new ReceiptAnalysisError('invalid_response', stage);
};

export const createReceiptAnalysisController = (
  options: CreateReceiptAnalysisControllerOptions = {},
): ReceiptAnalysisController => {
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
      review: state.review ?? null,
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

      let extraction: ReceiptExtractionResult;
      try {
        try {
          assertActive(runId, abortController.signal);
          const rawExtraction = await completionClient.complete(
            {
              apiKey: input.configuration.apiKey,
              model: input.configuration.visionModelId,
              reasoning: input.configuration.visionReasoning,
              messages: receiptExtractionMessages(
                input.configuration.extractionPrompt.text,
                toBase64(input.image.bytes),
              ),
            },
            abortController.signal,
          );
          assertActive(runId, abortController.signal);
          const parsedExtraction = parseReceiptExtractionResponse(rawExtraction);
          if (!parsedExtraction.ok) {
            publish({ ...state, review: recoverReviewSeed(rawExtraction) });
            throw new ReceiptAnalysisError(
              parsedExtraction.error.code === 'OUTPUT_TOO_LARGE'
                ? 'output_limit'
                : 'invalid_response',
              'extraction',
            );
          }
          extraction = parsedExtraction.value;
          publish({
            ...state,
            review: {
              receiptDate: extraction.receiptDate,
              buyplace: extraction.storeName,
              receiptTotalCents: extraction.receiptTotalCents,
              currency: extraction.currency,
              transfers: [],
            },
          });
          if (
            extraction.status === 'error' &&
            (extraction.items.length === 0 ||
              (extraction.currency !== null && extraction.currency !== 'EUR'))
          ) {
            throw new ReceiptAnalysisError('model_error', 'extraction', extraction.errorReason);
          }
        } finally {
          disposeNormalizedReceiptImage(input.image);
        }

        assertActive(runId, abortController.signal);
        publish({
          ...INITIAL_STATE,
          phase: 'deriving',
          stage: 'derivation',
          review: state.review ?? null,
        });

        const rawDerivation = await completionClient.complete(
          {
            apiKey: input.configuration.apiKey,
            model: input.configuration.transferModelId,
            reasoning: input.configuration.transferReasoning,
            messages: receiptDerivationMessages(
              input.configuration.transferPrompt.text,
              input.configuration.transferRules,
              extraction,
            ),
          },
          abortController.signal,
        );
        assertActive(runId, abortController.signal);
        const parsedDerivation = parseReceiptTransferDerivationResponse(rawDerivation, extraction);
        if (!parsedDerivation.ok) {
          publish({
            ...state,
            review: recoverReviewSeed(rawDerivation, extraction) ?? state.review ?? null,
          });
          throw new ReceiptAnalysisError(
            parsedDerivation.error.code === 'OUTPUT_TOO_LARGE'
              ? 'output_limit'
              : 'invalid_response',
            'derivation',
          );
        }
        const result = parsedDerivation.value;
        const review = reviewSeed(extraction, parsedDerivation);
        publish({ ...state, review });
        if (result.status === 'error') {
          throw new ReceiptAnalysisError(
            'model_error',
            'derivation',
            [extraction.errorReason, result.errorReason].filter(Boolean).join(' '),
          );
        }

        assertActive(runId, abortController.signal);
        activeAbortController = null;
        publish({
          phase: 'succeeded',
          stage: null,
          errorCode: null,
          errorReason: null,
          derivation: result,
          review,
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
