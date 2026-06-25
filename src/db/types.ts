// Defines internal DB contracts shared by runtime and query-service implementations.
import type { BindParams, QueryExecResult } from 'sql.js';

export const PRIMARY_INCOME_ACCOUNT_TYPE_ID = 1;
export const PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID = 2;

export const TRANSFER_TYPE_STD_EXPENSE = 1;
export const TRANSFER_TYPE_STD_EARNING = 2;
export const TRANSFER_TYPE_INTERN_TRANSFER = 3;

export interface BrowserDbRuntime {
  open(snapshotBytes: Uint8Array, options?: BrowserDbRuntimeOpenOptions): Promise<void>;
  close(): void;
  isOpen(): boolean;
  exec(sql: string, params?: BindParams): readonly QueryExecResult[];
  exportBytes(): Uint8Array;
}

export interface BrowserDbRuntimeOpenOptions {
  readonly canApply?: () => boolean;
}

export interface AccountRecord {
  readonly accountId: number;
  readonly name: string;
  readonly amountCents: number;
  readonly accountTypeId: number | null;
}

export interface CategoryRecord {
  readonly categoryId: number;
  readonly name: string;
}

export interface TransferRecord {
  readonly transferId: number;
  readonly bookingDateEpochDay: number;
  readonly name: string;
  readonly amountCents: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly number[];
  readonly buyplace: string | null;
}

export interface CreateTransferInput {
  readonly bookingDateEpochDay: number;
  readonly name: string;
  readonly amountCents: number;
  readonly transferTypeId: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly number[];
  readonly buyplace: string | null;
}

export interface CreateTransferResult {
  readonly transferId: number;
  readonly persistedAtIso: string;
}
