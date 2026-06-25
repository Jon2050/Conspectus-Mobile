// Loads Add Transfer account and category select options from local SQLite query services.
import { isDbRuntimeError, type AccountQueryService, type CategoryQueryService } from '@db';
import type { SyncState } from '@shared';

import type { AddTransferAccountOption, AddTransferCategoryOption } from './addTransferFormState';

export type AddTransferOptionsOperation = 'loading' | 'ready' | 'error';

export interface AddTransferOptionsError {
  readonly message: string;
  readonly cause?: unknown;
}

export interface AddTransferOptionsState {
  readonly operation: AddTransferOptionsOperation;
  readonly fromAccountOptions: readonly AddTransferAccountOption[];
  readonly toAccountOptions: readonly AddTransferAccountOption[];
  readonly categoryOptions: readonly AddTransferCategoryOption[];
  readonly error: AddTransferOptionsError | null;
}

export type AddTransferOptionsStateListener = (state: AddTransferOptionsState) => void;

export interface AddTransferOptionsController {
  getState(): AddTransferOptionsState;
  subscribe(listener: AddTransferOptionsStateListener): () => void;
  load(): Promise<void>;
}

const INITIAL_STATE: AddTransferOptionsState = {
  operation: 'loading',
  fromAccountOptions: [],
  toAccountOptions: [],
  categoryOptions: [],
  error: null,
};

const toAddTransferOptionsError = (
  error: unknown,
  fallbackMessage: string,
): AddTransferOptionsError => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return { message: error.message, cause: error };
  }

  return { message: fallbackMessage, cause: error };
};

const isDbRuntimeNotOpenError = (error: unknown): boolean =>
  isDbRuntimeError(error) && error.code === 'db_not_open';

export const shouldReloadAddTransferOptionsForSyncState = (syncState: SyncState): boolean =>
  syncState === 'synced' || syncState === 'stale' || syncState === 'offline';

export const createAddTransferOptionsController = (
  accountQueryService: Pick<
    AccountQueryService,
    'listAddTransferFromAccountOptions' | 'listAddTransferToAccountOptions'
  >,
  categoryQueryService: Pick<CategoryQueryService, 'listAllCategories'>,
): AddTransferOptionsController => {
  let state: AddTransferOptionsState = INITIAL_STATE;
  const listeners = new Set<AddTransferOptionsStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<AddTransferOptionsState>): void => {
    state = { ...state, ...patch };
    emitState();
  };

  return {
    getState(): AddTransferOptionsState {
      return state;
    },

    subscribe(listener: AddTransferOptionsStateListener): () => void {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },

    async load(): Promise<void> {
      updateState({
        operation: 'loading',
        fromAccountOptions: [],
        toAccountOptions: [],
        categoryOptions: [],
        error: null,
      });

      try {
        const fromAccountOptions = accountQueryService
          .listAddTransferFromAccountOptions()
          .map((account) => ({
            accountId: account.accountId,
            name: account.name,
          }));
        const toAccountOptions = accountQueryService
          .listAddTransferToAccountOptions()
          .map((account) => ({
            accountId: account.accountId,
            name: account.name,
          }));
        const categoryOptions = categoryQueryService.listAllCategories().map((category) => ({
          categoryId: category.categoryId,
          name: category.name,
        }));

        updateState({
          operation: 'ready',
          fromAccountOptions,
          toAccountOptions,
          categoryOptions,
          error: null,
        });
      } catch (error) {
        if (isDbRuntimeNotOpenError(error)) {
          updateState({
            operation: 'loading',
            fromAccountOptions: [],
            toAccountOptions: [],
            categoryOptions: [],
            error: null,
          });
          return;
        }

        updateState({
          operation: 'error',
          fromAccountOptions: [],
          toAccountOptions: [],
          categoryOptions: [],
          error: toAddTransferOptionsError(
            error,
            'Failed to load add-transfer account and category options.',
          ),
        });
      }
    },
  };
};
