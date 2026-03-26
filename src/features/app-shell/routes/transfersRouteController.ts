import type { AccountQueryService, CategoryQueryService, TransferMonthQueryService } from '@db';
import { formatAmountDisplay, formatEpochDayToDate, type AmountSemantic } from '@shared';

export type TransfersRouteOperation = 'loading' | 'ready' | 'empty' | 'error';

export interface TransfersRouteError {
  readonly message: string;
  readonly cause?: unknown;
}

export interface TransfersRouteTransfer {
  readonly transferId: number;
  readonly bookingDateEpochDay: number;
  readonly dateDisplay: string;
  readonly name: string;
  readonly amountCents: number;
  readonly amountDisplay: string;
  readonly amountSemantic: AmountSemantic;
  readonly fromAccountName: string;
  readonly toAccountName: string;
  readonly categoryNames: readonly string[];
  readonly buyplace: string | null;
}

export interface TransfersRouteState {
  readonly operation: TransfersRouteOperation;
  readonly transfers: readonly TransfersRouteTransfer[];
  readonly error: TransfersRouteError | null;
}

export type TransfersRouteStateListener = (state: TransfersRouteState) => void;

export interface TransfersRouteController {
  getState(): TransfersRouteState;
  subscribe(listener: TransfersRouteStateListener): () => void;
  load(monthAnchorEpochDay: number): Promise<void>;
}

const INITIAL_STATE: TransfersRouteState = {
  operation: 'loading',
  transfers: [],
  error: null,
};

const toTransfersRouteError = (error: unknown, fallbackMessage: string): TransfersRouteError => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return { message: error.message, cause: error };
  }
  return { message: fallbackMessage, cause: error };
};

const isDbRuntimeNotOpenError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'db_not_open';

export const createTransfersRouteController = (
  transferMonthQueryService: Pick<TransferMonthQueryService, 'listTransfersByMonth'>,
  accountQueryService: Pick<AccountQueryService, 'listAllAccounts'>,
  categoryQueryService: Pick<CategoryQueryService, 'listAllCategories'>,
): TransfersRouteController => {
  let state: TransfersRouteState = INITIAL_STATE;
  const listeners = new Set<TransfersRouteStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<TransfersRouteState>): void => {
    state = { ...state, ...patch };
    emitState();
  };

  return {
    getState(): TransfersRouteState {
      return state;
    },

    subscribe(listener: TransfersRouteStateListener): () => void {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },

    async load(monthAnchorEpochDay: number): Promise<void> {
      updateState({
        operation: 'loading',
        transfers: [],
        error: null,
      });

      try {
        const rawTransfers = transferMonthQueryService.listTransfersByMonth(monthAnchorEpochDay);

        if (rawTransfers.length === 0) {
          updateState({
            operation: 'empty',
            transfers: [],
            error: null,
          });
          return;
        }

        const accounts = accountQueryService.listAllAccounts();
        const categories = categoryQueryService.listAllCategories();

        const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
        const categoryMap = new Map(categories.map((c) => [c.categoryId, c.name]));

        const transfers = rawTransfers.map((t): TransfersRouteTransfer => {
          const fromAccount = accountMap.get(t.fromAccountId);
          const toAccount = accountMap.get(t.toAccountId);

          let semantic: AmountSemantic = 'neutral';
          if (toAccount?.accountTypeId === 1 || toAccount?.accountTypeId === 2) {
            semantic = 'negative';
          } else if (fromAccount?.accountTypeId === 1 || fromAccount?.accountTypeId === 2) {
            semantic = 'positive';
          }

          return {
            transferId: t.transferId,
            bookingDateEpochDay: t.bookingDateEpochDay,
            dateDisplay: formatEpochDayToDate(t.bookingDateEpochDay),
            name: t.name,
            amountCents: t.amountCents,
            amountDisplay: formatAmountDisplay(t.amountCents, semantic),
            amountSemantic: semantic,
            fromAccountName: fromAccount?.name ?? `Unknown (${t.fromAccountId})`,
            toAccountName: toAccount?.name ?? `Unknown (${t.toAccountId})`,
            categoryNames: t.categoryIds.map((id) => categoryMap.get(id) ?? `Unknown (${id})`),
            buyplace: t.buyplace,
          };
        });

        updateState({
          operation: 'ready',
          transfers,
          error: null,
        });
      } catch (error) {
        if (isDbRuntimeNotOpenError(error)) {
          updateState({
            operation: 'empty',
            transfers: [],
            error: null,
          });
          return;
        }

        updateState({
          operation: 'error',
          transfers: [],
          error: toTransfersRouteError(error, 'Failed to load transfers for the selected month.'),
        });
      }
    },
  };
};
