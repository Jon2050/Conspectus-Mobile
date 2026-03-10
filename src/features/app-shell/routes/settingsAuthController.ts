import type { AuthClient, AuthError, AuthSession } from '@auth';

export type SettingsAuthOperation = 'initializing' | 'idle' | 'signing_in' | 'signing_out';

export interface SettingsAuthState {
  readonly session: AuthSession;
  readonly operation: SettingsAuthOperation;
  readonly error: AuthError | null;
}

export type SettingsAuthStateListener = (state: SettingsAuthState) => void;

export interface SettingsAuthController {
  getState(): SettingsAuthState;
  subscribe(listener: SettingsAuthStateListener): () => void;
  initialize(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const UNAUTHENTICATED_SESSION: AuthSession = {
  isAuthenticated: false,
  account: null,
};

const isAuthError = (value: unknown): value is AuthError => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const authError = value as Partial<AuthError>;
  return typeof authError.code === 'string' && typeof authError.message === 'string';
};

const toAuthError = (error: unknown, fallbackMessage: string): AuthError => {
  if (isAuthError(error)) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      code: 'unknown',
      message: error.message,
      cause: error,
    };
  }

  return {
    code: 'unknown',
    message: fallbackMessage,
    cause: error,
  };
};

const applyStatePatch = (
  currentState: SettingsAuthState,
  patch: Partial<SettingsAuthState>,
): SettingsAuthState => ({
  ...currentState,
  ...patch,
});

export const createSettingsAuthController = (authClient: AuthClient): SettingsAuthController => {
  let state: SettingsAuthState = {
    session: UNAUTHENTICATED_SESSION,
    operation: 'idle',
    error: null,
  };
  let isInitialized = false;
  let initializationPromise: Promise<void> | null = null;
  const listeners = new Set<SettingsAuthStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<SettingsAuthState>): void => {
    state = applyStatePatch(state, patch);
    emitState();
  };

  const refreshSession = (): void => {
    updateState({ session: authClient.getSession() });
  };

  const ensureInitialized = async (): Promise<boolean> => {
    if (isInitialized) {
      return true;
    }

    await controller.initialize();
    return isInitialized;
  };

  const controller: SettingsAuthController = {
    getState(): SettingsAuthState {
      return state;
    },

    subscribe(listener: SettingsAuthStateListener): () => void {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },

    async initialize(): Promise<void> {
      if (isInitialized) {
        return;
      }

      if (initializationPromise !== null) {
        await initializationPromise;
        return;
      }

      updateState({
        operation: 'initializing',
        error: null,
      });

      initializationPromise = (async () => {
        try {
          await authClient.initialize();
          isInitialized = true;
          refreshSession();
          updateState({
            operation: 'idle',
            error: null,
          });
        } catch (error) {
          isInitialized = false;
          refreshSession();
          updateState({
            operation: 'idle',
            error: toAuthError(error, 'Failed to initialize authentication.'),
          });
        } finally {
          initializationPromise = null;
        }
      })();

      await initializationPromise;
    },

    async signIn(): Promise<void> {
      if (state.operation === 'signing_in' || state.operation === 'signing_out') {
        return;
      }

      if (!isInitialized) {
        const initialized = await ensureInitialized();
        if (!initialized || state.operation !== 'idle') {
          return;
        }
      } else if (state.operation !== 'idle') {
        return;
      }

      updateState({
        operation: 'signing_in',
        error: null,
      });

      try {
        await authClient.signIn();
        refreshSession();
        updateState({
          operation: 'idle',
          error: null,
        });
      } catch (error) {
        refreshSession();
        updateState({
          operation: 'idle',
          error: toAuthError(error, 'Sign-in failed.'),
        });
      }
    },

    async signOut(): Promise<void> {
      if (state.operation === 'signing_in' || state.operation === 'signing_out') {
        return;
      }

      if (!isInitialized) {
        const initialized = await ensureInitialized();
        if (!initialized || state.operation !== 'idle') {
          return;
        }
      } else if (state.operation !== 'idle') {
        return;
      }

      updateState({
        operation: 'signing_out',
        error: null,
      });

      try {
        await authClient.signOut();
        refreshSession();
        updateState({
          operation: 'idle',
          error: null,
        });
      } catch (error) {
        refreshSession();
        updateState({
          operation: 'idle',
          error: toAuthError(error, 'Sign-out failed.'),
        });
      }
    },
  };

  return controller;
};
