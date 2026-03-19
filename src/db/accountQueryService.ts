// Implements deterministic visible-account reads and strict row mapping for Accounts feature consumers.
import type { QueryExecResult } from 'sql.js';

import type { AccountRecord, BrowserDbRuntime } from './index';
import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';
import { appBrowserDbRuntime } from './browserDbRuntime';

const VISIBLE_NON_PRIMARY_ACCOUNTS_SQL = `
  SELECT account_id, name, amount
  FROM account
  WHERE visible = 1
    AND ac_type_id NOT IN (1, 2)
  ORDER BY ac_order ASC, LOWER(name) ASC, account_id ASC;
`;

const ACCOUNT_RESULT_COLUMNS = ['account_id', 'name', 'amount'] as const;

const hasExpectedColumns = (columns: readonly string[]): boolean =>
  columns.length === ACCOUNT_RESULT_COLUMNS.length &&
  ACCOUNT_RESULT_COLUMNS.every((expectedColumn, index) => columns[index] === expectedColumn);

const toInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new DbRuntimeError(
      'db_query_failed',
      `Expected "${fieldName}" to be a safe integer in account query results.`,
    );
  }

  return value;
};

const toName = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new DbRuntimeError(
      'db_query_failed',
      'Expected "name" to be a string in account query results.',
    );
  }

  return value;
};

const mapAccountQueryResult = (results: readonly QueryExecResult[]): readonly AccountRecord[] => {
  if (results.length === 0) {
    return [];
  }

  const firstResult = results[0];
  if (firstResult === undefined) {
    return [];
  }

  if (!hasExpectedColumns(firstResult.columns)) {
    throw new DbRuntimeError(
      'db_query_failed',
      'Account query result columns did not match the expected account projection.',
    );
  }

  return firstResult.values.map((row, rowIndex) => {
    if (row.length !== ACCOUNT_RESULT_COLUMNS.length) {
      throw new DbRuntimeError(
        'db_query_failed',
        `Account query row at index ${rowIndex} had an unexpected number of columns.`,
      );
    }

    return {
      accountId: toInteger(row[0], 'account_id'),
      name: toName(row[1]),
      amountCents: toInteger(row[2], 'amount'),
    };
  });
};

export interface AccountQueryService {
  listVisibleNonPrimaryAccounts(): readonly AccountRecord[];
}

export const createAccountQueryService = (
  dbRuntime: Pick<BrowserDbRuntime, 'exec'>,
): AccountQueryService => ({
  listVisibleNonPrimaryAccounts(): readonly AccountRecord[] {
    try {
      const results = dbRuntime.exec(VISIBLE_NON_PRIMARY_ACCOUNTS_SQL);
      return mapAccountQueryResult(results);
    } catch (error) {
      throw toDbRuntimeError(
        error,
        'db_query_failed',
        'Failed to load visible non-primary accounts from the local SQLite database.',
      );
    }
  },
});

export const appAccountQueryService = createAccountQueryService(appBrowserDbRuntime);
