// Manages confirmation and execution state for destructive local app data reset actions in Settings.
import type { CacheStore } from '@cache';

export type SettingsLocalDataResetOperation = 'idle' | 'confirming' | 'resetting';

export interface SettingsLocalDataResetError {
  readonly message: string;
  readonly cause?: unknown;
}

export interface SettingsLocalDataResetState {
  readonly operation: SettingsLocalDataResetOperation;
  readonly error: SettingsLocalDataResetError | null;
}

export type SettingsLocalDataResetStateListener = (state: SettingsLocalDataResetState) => void;

export interface SettingsLocalDataController {
  getState(): SettingsLocalDataResetState;
  subscribe(listener: SettingsLocalDataResetStateListener): () => void;
  requestReset(): void;
  cancelReset(): void;
  confirmReset(): Promise<void>;
}

interface CreateSettingsLocalDataControllerOptions {
  readonly onLocalDataReset: () => void;
}

const INITIAL_STATE: SettingsLocalDataResetState = {
  operation: 'idle',
  error: null,
};

const toResetError = (error: unknown, fallbackMessage: string): SettingsLocalDataResetError => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      message: error.message,
      cause: error,
    };
  }

  return {
    message: fallbackMessage,
    cause: error,
  };
};

export const createSettingsLocalDataController = (
  cacheStore: Pick<CacheStore, 'clearAll'>,
  options: CreateSettingsLocalDataControllerOptions,
): SettingsLocalDataController => {
  let state = INITIAL_STATE;
  const listeners = new Set<SettingsLocalDataResetStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<SettingsLocalDataResetState>): void => {
    state = {
      ...state,
      ...patch,
    };
    emitState();
  };

  return {
    getState(): SettingsLocalDataResetState {
      return state;
    },
    subscribe(listener: SettingsLocalDataResetStateListener): () => void {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },
    requestReset(): void {
      if (state.operation !== 'idle') {
        return;
      }

      updateState({
        operation: 'confirming',
        error: null,
      });
    },
    cancelReset(): void {
      if (state.operation !== 'confirming') {
        return;
      }

      updateState(INITIAL_STATE);
    },
    async confirmReset(): Promise<void> {
      if (state.operation !== 'confirming') {
        return;
      }

      updateState({
        operation: 'resetting',
        error: null,
      });

      try {
        await cacheStore.clearAll();
        options.onLocalDataReset();
        updateState(INITIAL_STATE);
      } catch (error) {
        updateState({
          operation: 'confirming',
          error: toResetError(error, 'Failed to reset local app data.'),
        });
      }
    },
  };
};
