// Loads visible account rows from the DB query service and exposes route-ready view models.
import type { AccountQueryService, AccountRecord } from '@db';

export type AccountsRouteAmountSemantic = 'positive' | 'negative' | 'neutral';

export type AccountsRouteOperation = 'loading' | 'ready' | 'empty' | 'error';

export interface AccountsRouteError {
  readonly message: string;
  readonly cause?: unknown;
}

export interface AccountsRouteAccount {
  readonly accountId: number;
  readonly name: string;
  readonly amountCents: number;
  readonly amountDisplay: string;
  readonly amountSemantic: AccountsRouteAmountSemantic;
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

const WHOLE_DOLLAR_FORMATTER = new Intl.NumberFormat('en-US');

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
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'db_not_open';

const deriveAmountSemantic = (amountCents: number): AccountsRouteAmountSemantic => {
  if (amountCents > 0) {
    return 'positive';
  }

  if (amountCents < 0) {
    return 'negative';
  }

  return 'neutral';
};

const formatAmountDisplay = (amountCents: number): string => {
  const absoluteAmountCents = Math.abs(amountCents);
  const wholeDollars = Math.trunc(absoluteAmountCents / 100);
  const remainingCents = absoluteAmountCents % 100;
  const currencyValue = `$${WHOLE_DOLLAR_FORMATTER.format(wholeDollars)}.${remainingCents
    .toString()
    .padStart(2, '0')}`;

  if (amountCents > 0) {
    return `+${currencyValue}`;
  }

  if (amountCents < 0) {
    return `-${currencyValue}`;
  }

  return currencyValue;
};

const toRouteAccount = (account: AccountRecord): AccountsRouteAccount => ({
  accountId: account.accountId,
  name: account.name,
  amountCents: account.amountCents,
  amountDisplay: formatAmountDisplay(account.amountCents),
  amountSemantic: deriveAmountSemantic(account.amountCents),
});

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
