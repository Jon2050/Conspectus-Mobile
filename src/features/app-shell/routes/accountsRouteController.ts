// Loads visible account rows from the DB query service and exposes route-ready view models.
import { isDbRuntimeError, type AccountQueryService, type AccountRecord } from '@db';
import { type AmountSemantic } from '@shared';

export type AccountsRouteOperation = 'loading' | 'ready' | 'empty' | 'error';

export interface AccountsRouteError {
  readonly message: string;
  readonly cause?: unknown;
}

export interface AccountsRouteAccount {
  readonly accountId: number;
  readonly name: string;
  readonly amountCents: number;
  readonly amountSemantic: AmountSemantic;
}

export interface AccountsRouteState {
  readonly operation: AccountsRouteOperation;
  readonly accounts: readonly AccountsRouteAccount[];
  readonly error: AccountsRouteError | null;
}

export type AccountsRouteStateListener = (state: AccountsRouteState) => void;

export interface AccountsRouteController {
  getState(): AccountsRouteState;
  subscribe(listener: AccountsRouteStateListener): () => void;
  load(): Promise<void>;
}

const INITIAL_STATE: AccountsRouteState = {
  operation: 'loading',
  accounts: [],
  error: null,
};

const toAccountsRouteError = (error: unknown, fallbackMessage: string): AccountsRouteError => {
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

const isDbRuntimeNotOpenError = (error: unknown): boolean =>
  isDbRuntimeError(error) && error.code === 'db_not_open';

const deriveAmountSemantic = (amountCents: number): AmountSemantic => {
  if (amountCents > 0) {
    return 'positive';
  }

  if (amountCents < 0) {
    return 'negative';
  }

  return 'neutral';
};
const toRouteAccount = (account: AccountRecord): AccountsRouteAccount => {
  const semantic = deriveAmountSemantic(account.amountCents) as AmountSemantic;
  return {
    accountId: account.accountId,
    name: account.name,
    amountCents: account.amountCents,
    amountSemantic: semantic,
  };
};

export const createAccountsRouteController = (
  accountQueryService: Pick<AccountQueryService, 'listVisibleNonPrimaryAccounts'>,
): AccountsRouteController => {
  let state: AccountsRouteState = INITIAL_STATE;
  const listeners = new Set<AccountsRouteStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<AccountsRouteState>): void => {
    state = {
      ...state,
      ...patch,
    };
    emitState();
  };

  return {
    getState(): AccountsRouteState {
      return state;
    },

    subscribe(listener: AccountsRouteStateListener): () => void {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },

    async load(): Promise<void> {
      updateState({
        operation: 'loading',
        accounts: [],
        error: null,
      });

      try {
        const accounts = accountQueryService.listVisibleNonPrimaryAccounts().map(toRouteAccount);

        updateState({
          operation: accounts.length === 0 ? 'empty' : 'ready',
          accounts,
          error: null,
        });
      } catch (error) {
        if (isDbRuntimeNotOpenError(error)) {
          updateState({
            operation: 'empty',
            accounts: [],
            error: null,
          });
          return;
        }

        updateState({
          operation: 'error',
          accounts: [],
          error: toAccountsRouteError(error, 'Failed to load visible non-primary accounts.'),
        });
      }
    },
  };
};
