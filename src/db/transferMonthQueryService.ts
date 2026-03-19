// Implements inclusive transfer-by-month reads with deterministic sorting and strict row mapping.
import type { QueryExecResult } from 'sql.js';

import type { BrowserDbRuntime, TransferRecord } from './index';
import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';
import { appBrowserDbRuntime } from './browserDbRuntime';

const TRANSFERS_BY_MONTH_SQL = `
  SELECT transfer_id, date, name, amount, from_account, to_account,
         category_1_id, category_2_id, category_3_id, buyplace
  FROM transfer
  WHERE date >= ? AND date <= ?
  ORDER BY date ASC, transfer_id ASC;
`;

const TRANSFER_RESULT_COLUMNS = [
  'transfer_id',
  'date',
  'name',
  'amount',
  'from_account',
  'to_account',
  'category_1_id',
  'category_2_id',
  'category_3_id',
  'buyplace',
] as const;

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EpochDayMonthBounds {
  readonly startEpochDay: number;
  readonly endEpochDay: number;
}

const toEpochDayFromUtcDate = (year: number, monthIndex: number, day: number): number =>
  Math.floor(Date.UTC(year, monthIndex, day) / MILLIS_PER_DAY);

const hasExpectedColumns = (columns: readonly string[]): boolean =>
  columns.length === TRANSFER_RESULT_COLUMNS.length &&
  TRANSFER_RESULT_COLUMNS.every((expectedColumn, index) => columns[index] === expectedColumn);

const toInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new DbRuntimeError(
      'db_query_failed',
      `Expected "${fieldName}" to be a safe integer in transfer query results.`,
    );
  }

  return value;
};

const toNullableInteger = (value: unknown, fieldName: string): number | null => {
  if (value === null) {
    return null;
  }

  return toInteger(value, fieldName);
};

const toName = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new DbRuntimeError(
      'db_query_failed',
      'Expected "name" to be a string in transfer query results.',
    );
  }

  return value;
};

const toNullableText = (value: unknown, fieldName: string): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new DbRuntimeError(
      'db_query_failed',
      `Expected "${fieldName}" to be a string or null in transfer query results.`,
    );
  }

  return value;
};

const mapTransferQueryResult = (results: readonly QueryExecResult[]): readonly TransferRecord[] => {
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
      'Transfer query result columns did not match the expected transfer projection.',
    );
  }

  return firstResult.values.map((row, rowIndex) => {
    if (row.length !== TRANSFER_RESULT_COLUMNS.length) {
      throw new DbRuntimeError(
        'db_query_failed',
        `Transfer query row at index ${rowIndex} had an unexpected number of columns.`,
      );
    }

    const categoryIds = [row[6], row[7], row[8]]
      .map((value, index) => toNullableInteger(value, `category_${index + 1}_id`))
      .filter((value): value is number => value !== null);

    return {
      transferId: toInteger(row[0], 'transfer_id'),
      bookingDateEpochDay: toInteger(row[1], 'date'),
      name: toName(row[2]),
      amountCents: toInteger(row[3], 'amount'),
      fromAccountId: toInteger(row[4], 'from_account'),
      toAccountId: toInteger(row[5], 'to_account'),
      categoryIds,
      buyplace: toNullableText(row[9], 'buyplace'),
    };
  });
};

export const getEpochDayMonthBounds = (monthAnchorEpochDay: number): EpochDayMonthBounds => {
  const safeMonthAnchorEpochDay = toInteger(monthAnchorEpochDay, 'monthAnchorEpochDay');
  const anchorDate = new Date(safeMonthAnchorEpochDay * MILLIS_PER_DAY);
  const year = anchorDate.getUTCFullYear();
  const monthIndex = anchorDate.getUTCMonth();

  return {
    startEpochDay: toEpochDayFromUtcDate(year, monthIndex, 1),
    endEpochDay: toEpochDayFromUtcDate(year, monthIndex + 1, 0),
  };
};

export interface TransferMonthQueryService {
  listTransfersByMonth(monthAnchorEpochDay: number): readonly TransferRecord[];
}

export const createTransferMonthQueryService = (
  dbRuntime: Pick<BrowserDbRuntime, 'exec'>,
): TransferMonthQueryService => ({
  listTransfersByMonth(monthAnchorEpochDay: number): readonly TransferRecord[] {
    const monthBounds = getEpochDayMonthBounds(monthAnchorEpochDay);

    try {
      const results = dbRuntime.exec(TRANSFERS_BY_MONTH_SQL, [
        monthBounds.startEpochDay,
        monthBounds.endEpochDay,
      ]);
      return mapTransferQueryResult(results);
    } catch (error) {
      throw toDbRuntimeError(
        error,
        'db_query_failed',
        'Failed to load transfers for the selected month from the local SQLite database.',
      );
    }
  },
});

export const appTransferMonthQueryService = createTransferMonthQueryService(appBrowserDbRuntime);
