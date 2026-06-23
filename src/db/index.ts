// Exposes the public DB runtime contract and typed entities for read/write services.
export type { BindParams, QueryExecResult, SqlValue } from 'sql.js';
export {
  PRIMARY_INCOME_ACCOUNT_TYPE_ID,
  PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  type AccountRecord,
  type BrowserDbRuntime,
  type BrowserDbRuntimeOpenOptions,
  type CategoryRecord,
  type CreateTransferInput,
  type CreateTransferResult,
  type TransferRecord,
} from './types';
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
  resolveAppBrowserDbRuntime,
} from './browserDbRuntime';
export {
  DbRuntimeError,
  isDbRuntimeError,
  toDbRuntimeError,
  type DbRuntimeErrorCode,
} from './dbRuntimeErrors';
export { appSqlJsLoader, createSqlJsLoader, type SqlJsLoader } from './sqlJsLoader';
