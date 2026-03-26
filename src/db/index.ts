// Exposes the public DB runtime contract and typed entities for read/write services.
export type { BindParams, QueryExecResult, SqlValue } from 'sql.js';
export {
  appAccountQueryService,
  createAccountQueryService,
  type AccountQueryService,
} from './accountQueryService';
export {
  appTransferMonthQueryService,
  createTransferMonthQueryService,
  getEpochDayMonthBounds,
  type EpochDayMonthBounds,
  type TransferMonthQueryService,
} from './transferMonthQueryService';
export {
  appCategoryQueryService,
  createCategoryQueryService,
  type CategoryQueryService,
} from './categoryQueryService';
export {
  appBrowserDbRuntime,
  createBrowserDbRuntime,
  type BrowserDbRuntime,
} from './browserDbRuntime';
export {
  DbRuntimeError,
  isDbRuntimeError,
  toDbRuntimeError,
  type DbRuntimeErrorCode,
} from './dbRuntimeErrors';
export { appSqlJsLoader, createSqlJsLoader, type SqlJsLoader } from './sqlJsLoader';

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
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly number[];
  readonly buyplace: string | null;
}

export interface CreateTransferResult {
  readonly transferId: number;
  readonly persistedAtIso: string;
}
