// Coordinates one ephemeral receipt capture, normalization, stage-one handoff, and cleanup.
import type { ReadyOpenRouterReceiptConfiguration } from './openRouterReceiptConfiguration';
import {
  ReceiptImageNormalizationError,
  disposeNormalizedReceiptImage,
  type NormalizedReceiptImage,
  type ReceiptImageNormalizationErrorCode,
  type ReceiptImageNormalizer,
} from './receiptImageNormalization';

export type ReceiptCapturePhase = 'idle' | 'normalizing' | 'handed_off' | 'error';
export type ReceiptCaptureErrorCode =
  | ReceiptImageNormalizationErrorCode
  | 'configuration_unavailable'
  | 'stage_one_failed';

export interface ReceiptCaptureState {
  readonly phase: ReceiptCapturePhase;
  readonly errorCode: ReceiptCaptureErrorCode | null;
}

export interface ReceiptStageOneStartInput {
  readonly image: NormalizedReceiptImage;
  readonly configuration: ReadyOpenRouterReceiptConfiguration;
}

export interface ReceiptStageOneStarter {
  start(input: ReceiptStageOneStartInput, signal: AbortSignal): Promise<void>;
  reset?(): void;
}

export interface ReceiptCaptureController {
  getState(): ReceiptCaptureState;
  subscribe(listener: (state: ReceiptCaptureState) => void): () => void;
  capture(file: File | null): Promise<boolean>;
  cancel(): void;
  reset(): void;
  dispose(): void;
}

interface CreateReceiptCaptureControllerOptions {
  readonly normalizer: ReceiptImageNormalizer;
  readonly resolveConfiguration: () => ReadyOpenRouterReceiptConfiguration | null;
  readonly stageOneStarter: ReceiptStageOneStarter;
}

const INITIAL_STATE: ReceiptCaptureState = {
  phase: 'idle',
  errorCode: null,
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export const createReceiptCaptureController = (
  options: CreateReceiptCaptureControllerOptions,
): ReceiptCaptureController => {
  const listeners = new Set<(state: ReceiptCaptureState) => void>();
  let state = INITIAL_STATE;
  let activeAbortController: AbortController | null = null;
  let activeNormalizedImage: NormalizedReceiptImage | null = null;
  let activeRunId = 0;
  let isDisposed = false;

  const publish = (nextState: ReceiptCaptureState): void => {
    state = nextState;
    listeners.forEach((listener) => listener(state));
  };

  const cancelActiveRun = (): void => {
    activeRunId += 1;
    activeAbortController?.abort();
    activeAbortController = null;
    disposeNormalizedReceiptImage(activeNormalizedImage);
    activeNormalizedImage = null;
    options.stageOneStarter.reset?.();
  };

  const reset = (): void => {
    cancelActiveRun();
    if (!isDisposed) {
      publish(INITIAL_STATE);
    }
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

    async capture(file): Promise<boolean> {
      if (isDisposed || file === null || activeAbortController !== null) {
        return false;
      }

      options.stageOneStarter.reset?.();

      const configuration = (() => {
        try {
          return options.resolveConfiguration();
        } catch {
          return null;
        }
      })();
      if (configuration === null) {
        publish({ phase: 'error', errorCode: 'configuration_unavailable' });
        return false;
      }

      const runId = ++activeRunId;
      const abortController = new AbortController();
      activeAbortController = abortController;
      let normalizedImage: NormalizedReceiptImage | null = null;
      publish({ phase: 'normalizing', errorCode: null });

      try {
        normalizedImage = await options.normalizer.normalize(file, abortController.signal);
        if (runId !== activeRunId || abortController.signal.aborted) {
          return false;
        }

        activeNormalizedImage = normalizedImage;
        publish({ phase: 'handed_off', errorCode: null });
        await options.stageOneStarter.start(
          { image: normalizedImage, configuration },
          abortController.signal,
        );
        if (runId !== activeRunId || abortController.signal.aborted) {
          return false;
        }

        activeAbortController = null;
        publish(INITIAL_STATE);
        return true;
      } catch (error) {
        if (runId !== activeRunId || isAbortError(error)) {
          return false;
        }

        activeAbortController = null;
        publish({
          phase: 'error',
          errorCode:
            error instanceof ReceiptImageNormalizationError ? error.code : 'stage_one_failed',
        });
        return false;
      } finally {
        if (activeNormalizedImage === normalizedImage) {
          activeNormalizedImage = null;
        }
        disposeNormalizedReceiptImage(normalizedImage);
      }
    },

    cancel: reset,
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
