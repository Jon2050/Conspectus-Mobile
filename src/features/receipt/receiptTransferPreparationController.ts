// Owns transient source selection, staged progress, validation, and the M9-05 command handoff.
import type { CreateTransferInput } from '@db';

import type { AddTransferOptionsState } from '../transfers/transferOptions';
import type { ReceiptAnalysisState } from './receiptAnalysisController';
import {
  buildReviewedReceiptTransferCommands,
  type ReceiptTransferPreparationError,
} from './receiptTransferCommandBuilder';
import { createReceiptReviewDraft, type ReceiptReviewDraft } from './receiptReviewDraft';

export type ReceiptProcessingStepId = 'extraction' | 'derivation' | 'creation';
export type ReceiptProcessingStepStatus = 'pending' | 'active' | 'complete' | 'error';
export type ReceiptTransferPreparationPhase =
  | 'idle'
  | 'processing'
  | 'waiting_for_source'
  | 'reviewing'
  | 'ready_for_commit'
  | 'committing'
  | 'commit_failed'
  | 'committed'
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
  readonly draft?: ReceiptReviewDraft | null;
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
  updateDraft(draft: ReceiptReviewDraft): void;
  prepareForSave(optionsState: AddTransferOptionsState): void;
  claimReadyForCommit(): readonly CreateTransferInput[] | null;
  markCommitActive(): void;
  markCommitFailed(): void;
  markCommitted(): void;
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
  draft: null,
});

export const createReceiptTransferPreparationController =
  (): ReceiptTransferPreparationController => {
    const listeners = new Set<(state: ReceiptTransferPreparationState) => void>();
    let state = INITIAL_STATE;

    let isDisposed = false;

    const publish = (nextState: ReceiptTransferPreparationState): void => {
      const draft = nextState.draft;
      state = Object.freeze({
        ...nextState,
        draft: draft
          ? Object.freeze({
              ...draft,
              transfers: Object.freeze(
                draft.transfers.map((row) =>
                  Object.freeze({ ...row, categoryNames: Object.freeze([...row.categoryNames]) }),
                ),
              ),
            })
          : null,
      });
      listeners.forEach((listener) => listener(state));
    };

    const fail = (
      step: ReceiptProcessingStepId,
      error: ReceiptTransferPreparationError | null,
    ): void => {
      const failedSteps =
        step === 'extraction'
          ? steps('error', 'pending', 'pending')
          : step === 'derivation'
            ? steps('complete', 'error', 'pending')
            : steps('complete', 'complete', 'error');
      publish({
        phase: 'error',
        draft: null,
        steps: failedSteps,
        sourceAccountId: null,
        readyForCommit: null,
        error,
      });
    };

    const tryPrepare = (optionsState: AddTransferOptionsState): void => {
      if (isDisposed || !state.draft || !['reviewing', 'waiting_for_source'].includes(state.phase))
        return;
      if (state.sourceAccountId === null) {
        publish({ ...state, error: { code: 'source_account_unavailable', detail: null } });
        return;
      }
      const result = buildReviewedReceiptTransferCommands(
        state.draft,
        state.sourceAccountId,
        optionsState,
      );
      if (!result.ok) {
        publish({ ...state, error: result.error });
        return;
      }
      publish({
        ...state,
        phase: 'ready_for_commit',
        steps: steps('complete', 'complete', 'pending'),
        readyForCommit: result.commands,
        error: null,
      });
    };

    const reset = (): void => {
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
        publish({
          phase: 'processing',
          draft: null,
          steps: steps('active', 'pending', 'pending'),
          sourceAccountId: null,
          readyForCommit: null,
          error: null,
        });
      },

      handleCaptureFailure(): void {
        if (!isDisposed && !state.draft && state.phase !== 'idle' && state.phase !== 'error') {
          fail('extraction', null);
        }
      },

      handleAnalysisState(analysisState): void {
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
        if (analysisState.phase === 'error' || analysisState.phase === 'succeeded') {
          const result = analysisState.derivation;
          const seed =
            analysisState.review ??
            (result
              ? {
                  receiptDate: result.transfers[0]?.receiptDate ?? null,
                  buyplace: result.transfers[0]?.buyplace ?? null,
                  receiptTotalCents: result.receiptTotalCents,
                  transfers: result.transfers,
                }
              : null);
          if (!seed) {
            fail(analysisState.stage === 'derivation' ? 'derivation' : 'extraction', null);
            return;
          }
          publish({
            ...state,
            phase: state.sourceAccountId === null ? 'waiting_for_source' : 'reviewing',
            draft: createReceiptReviewDraft(seed),
            readyForCommit: null,
            error: null,
            steps:
              analysisState.phase === 'error'
                ? steps(
                    analysisState.stage === 'extraction' ? 'error' : 'complete',
                    analysisState.stage === 'derivation' ? 'error' : 'pending',
                    'pending',
                  )
                : steps('complete', 'complete', 'pending'),
          });
        }
      },

      selectSourceAccount(sourceAccountId): void {
        if (isDisposed || !['processing', 'waiting_for_source', 'reviewing'].includes(state.phase))
          return;
        publish({
          ...state,
          sourceAccountId,
          error: null,
          phase: state.draft
            ? sourceAccountId === null
              ? 'waiting_for_source'
              : 'reviewing'
            : 'processing',
        });
      },

      refreshOptions(optionsState): void {
        if (
          isDisposed ||
          !['processing', 'waiting_for_source', 'reviewing'].includes(state.phase) ||
          optionsState.operation === 'loading'
        )
          return;
        if (optionsState.operation !== 'ready') {
          if (state.draft)
            publish({ ...state, error: { code: 'options_unavailable', detail: null } });
          else fail(activeStep(), { code: 'options_unavailable', detail: null });
        }
      },

      updateDraft(draft): void {
        if (isDisposed || !['reviewing', 'waiting_for_source'].includes(state.phase)) return;
        publish({ ...state, draft, error: null });
      },

      prepareForSave: tryPrepare,

      claimReadyForCommit(): readonly CreateTransferInput[] | null {
        if (isDisposed || state.phase !== 'ready_for_commit' || state.readyForCommit === null) {
          return null;
        }
        const commands = state.readyForCommit;
        publish({
          phase: 'committing',
          steps: steps('complete', 'complete', 'active'),
          sourceAccountId: state.sourceAccountId,
          readyForCommit: null,
          error: null,
          draft: null,
        });
        return commands;
      },

      markCommitActive(): void {
        if (isDisposed || !['committing', 'commit_failed'].includes(state.phase)) return;
        publish({ ...state, phase: 'committing', steps: steps('complete', 'complete', 'active') });
      },

      markCommitFailed(): void {
        if (isDisposed || state.phase !== 'committing') return;
        publish({
          phase: 'commit_failed',
          steps: steps('complete', 'complete', 'error'),
          sourceAccountId: null,
          readyForCommit: null,
          error: null,
        });
      },

      markCommitted(): void {
        if (isDisposed || state.phase !== 'committing') return;
        publish({
          phase: 'committed',
          steps: steps('complete', 'complete', 'complete'),
          sourceAccountId: null,
          readyForCommit: null,
          error: null,
        });
      },

      failForOffline(): void {
        if (state.error?.code === 'offline') return;
        if (!isDisposed && state.draft) {
          publish({ ...state, error: { code: 'offline', detail: null } });
          return;
        }
        if (!isDisposed && state.phase !== 'idle' && state.phase !== 'error') {
          fail(activeStep(), { code: 'offline', detail: null });
        }
      },

      reset,

      dispose(): void {
        if (isDisposed) return;
        isDisposed = true;
        state = INITIAL_STATE;
        listeners.clear();
      },
    };
  };
