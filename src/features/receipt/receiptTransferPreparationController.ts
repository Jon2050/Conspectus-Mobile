// Owns transient source selection, staged progress, validation, and the M9-05 command handoff.
import type { CreateTransferInput } from '@db';

import type { AddTransferOptionsState } from '../app-shell/routes/addTransferOptionsController';
import type { ReceiptAnalysisState } from './receiptAnalysisController';
import {
  buildReceiptTransferCommands,
  validateReceiptSourceAccountTopology,
  type ReceiptTransferPreparationError,
} from './receiptTransferCommandBuilder';
import type { ReceiptTransferDerivation } from './receiptAnalysisContracts';

export type ReceiptProcessingStepId = 'extraction' | 'derivation' | 'creation';
export type ReceiptProcessingStepStatus = 'pending' | 'active' | 'complete' | 'error';
export type ReceiptTransferPreparationPhase =
  | 'idle'
  | 'processing'
  | 'waiting_for_source'
  | 'ready_for_commit'
  | 'error';

export interface ReceiptProcessingStep {
  readonly id: ReceiptProcessingStepId;
  readonly status: ReceiptProcessingStepStatus;
}

export interface ReceiptTransferPreparationState {
  readonly phase: ReceiptTransferPreparationPhase;
  readonly steps: readonly ReceiptProcessingStep[];
  readonly sourceAccountId: number | null;
  readonly readyForCommit: readonly CreateTransferInput[] | null;
  readonly error: ReceiptTransferPreparationError | null;
}

export interface ReceiptTransferPreparationController {
  getState(): ReceiptTransferPreparationState;
  subscribe(listener: (state: ReceiptTransferPreparationState) => void): () => void;
  beginRun(): void;
  handleCaptureFailure(): void;
  handleAnalysisState(
    analysisState: ReceiptAnalysisState,
    optionsState: AddTransferOptionsState,
  ): void;
  selectSourceAccount(sourceAccountId: number | null, optionsState: AddTransferOptionsState): void;
  refreshOptions(optionsState: AddTransferOptionsState): void;
  failForOffline(): void;
  reset(): void;
  dispose(): void;
}

const steps = (
  extraction: ReceiptProcessingStepStatus,
  derivation: ReceiptProcessingStepStatus,
  creation: ReceiptProcessingStepStatus,
): readonly ReceiptProcessingStep[] =>
  Object.freeze([
    Object.freeze({ id: 'extraction' as const, status: extraction }),
    Object.freeze({ id: 'derivation' as const, status: derivation }),
    Object.freeze({ id: 'creation' as const, status: creation }),
  ]);

const INITIAL_STATE: ReceiptTransferPreparationState = Object.freeze({
  phase: 'idle',
  steps: steps('pending', 'pending', 'pending'),
  sourceAccountId: null,
  readyForCommit: null,
  error: null,
});

export const createReceiptTransferPreparationController =
  (): ReceiptTransferPreparationController => {
    const listeners = new Set<(state: ReceiptTransferPreparationState) => void>();
    let state = INITIAL_STATE;
    let derivation: ReceiptTransferDerivation | null = null;
    let expectedItemIndexes: readonly number[] | null = null;
    let isDisposed = false;

    const publish = (nextState: ReceiptTransferPreparationState): void => {
      state = Object.freeze(nextState);
      listeners.forEach((listener) => listener(state));
    };

    const clearTransientResult = (): void => {
      derivation = null;
      expectedItemIndexes = null;
    };

    const fail = (
      step: ReceiptProcessingStepId,
      error: ReceiptTransferPreparationError | null,
    ): void => {
      clearTransientResult();
      const failedSteps =
        step === 'extraction'
          ? steps('error', 'pending', 'pending')
          : step === 'derivation'
            ? steps('complete', 'error', 'pending')
            : steps('complete', 'complete', 'error');
      publish({
        phase: 'error',
        steps: failedSteps,
        sourceAccountId: null,
        readyForCommit: null,
        error,
      });
    };

    const tryPrepare = (optionsState: AddTransferOptionsState): void => {
      if (
        isDisposed ||
        derivation === null ||
        expectedItemIndexes === null ||
        state.sourceAccountId === null ||
        state.phase === 'ready_for_commit' ||
        state.phase === 'error'
      ) {
        return;
      }

      const result = buildReceiptTransferCommands(
        derivation,
        expectedItemIndexes,
        state.sourceAccountId,
        optionsState,
      );
      if (!result.ok) {
        fail('creation', result.error);
        return;
      }

      clearTransientResult();
      publish({
        phase: 'ready_for_commit',
        steps: steps('complete', 'complete', 'active'),
        sourceAccountId: state.sourceAccountId,
        readyForCommit: result.commands,
        error: null,
      });
    };

    const reset = (): void => {
      clearTransientResult();
      if (!isDisposed) {
        publish(INITIAL_STATE);
      }
    };

    const activeStep = (): ReceiptProcessingStepId =>
      state.steps.find((step) => step.status === 'active')?.id ?? 'creation';

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

      beginRun(): void {
        if (isDisposed) return;
        clearTransientResult();
        publish({
          phase: 'processing',
          steps: steps('active', 'pending', 'pending'),
          sourceAccountId: null,
          readyForCommit: null,
          error: null,
        });
      },

      handleCaptureFailure(): void {
        if (!isDisposed && state.phase !== 'idle' && state.phase !== 'error') {
          fail('extraction', null);
        }
      },

      handleAnalysisState(analysisState, optionsState): void {
        if (isDisposed || state.phase === 'idle' || state.phase === 'error') {
          return;
        }

        if (analysisState.phase === 'extracting') {
          publish({ ...state, phase: 'processing', steps: steps('active', 'pending', 'pending') });
          return;
        }
        if (analysisState.phase === 'deriving') {
          publish({ ...state, phase: 'processing', steps: steps('complete', 'active', 'pending') });
          return;
        }
        if (analysisState.phase === 'error') {
          fail(analysisState.stage === 'derivation' ? 'derivation' : 'extraction', null);
          return;
        }
        if (
          analysisState.phase === 'succeeded' &&
          analysisState.derivation !== null &&
          analysisState.extractedItemIndexes !== null
        ) {
          derivation = analysisState.derivation;
          expectedItemIndexes = Object.freeze([...analysisState.extractedItemIndexes]);
          if (state.sourceAccountId === null) {
            const topologyError = validateReceiptSourceAccountTopology(optionsState);
            if (topologyError !== null) {
              fail('creation', topologyError);
              return;
            }
            publish({
              ...state,
              phase: 'waiting_for_source',
              steps: steps('complete', 'complete', 'pending'),
            });
            return;
          }
          publish({
            ...state,
            phase: 'processing',
            steps: steps('complete', 'complete', 'active'),
          });
          tryPrepare(optionsState);
        }
      },

      selectSourceAccount(sourceAccountId, optionsState): void {
        if (
          isDisposed ||
          state.phase === 'idle' ||
          state.phase === 'error' ||
          state.phase === 'ready_for_commit'
        ) {
          return;
        }
        publish({ ...state, sourceAccountId });
        if (derivation !== null && expectedItemIndexes !== null) {
          if (sourceAccountId === null) {
            publish({ ...state, sourceAccountId: null, phase: 'waiting_for_source' });
            return;
          }
          publish({
            ...state,
            sourceAccountId,
            phase: 'processing',
            steps: steps('complete', 'complete', 'active'),
          });
          tryPrepare(optionsState);
        }
      },

      refreshOptions(optionsState): void {
        if (
          isDisposed ||
          state.phase === 'idle' ||
          state.phase === 'error' ||
          state.phase === 'ready_for_commit'
        ) {
          return;
        }
        if (optionsState.operation !== 'ready') {
          fail(activeStep(), { code: 'options_unavailable', detail: null });
          return;
        }
        if (derivation !== null && state.sourceAccountId === null) {
          const topologyError = validateReceiptSourceAccountTopology(optionsState);
          if (topologyError !== null) {
            fail('creation', topologyError);
          }
          return;
        }
        if (state.sourceAccountId !== null && derivation !== null) {
          tryPrepare(optionsState);
        }
      },

      failForOffline(): void {
        if (!isDisposed && state.phase !== 'idle' && state.phase !== 'error') {
          fail(activeStep(), { code: 'offline', detail: null });
        }
      },

      reset,

      dispose(): void {
        if (isDisposed) return;
        clearTransientResult();
        isDisposed = true;
        state = INITIAL_STATE;
        listeners.clear();
      },
    };
  };
