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
