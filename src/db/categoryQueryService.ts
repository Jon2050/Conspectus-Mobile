import type { QueryExecResult } from 'sql.js';

import type { BrowserDbRuntime, CategoryRecord } from './index';
import { DbRuntimeError, toDbRuntimeError } from './dbRuntimeErrors';
import { appBrowserDbRuntime } from './browserDbRuntime';

const ALL_CATEGORIES_SQL = `
  SELECT category_id, name
  FROM category
  ORDER BY LOWER(name) ASC;
`;

const CATEGORY_RESULT_COLUMNS = ['category_id', 'name'] as const;

const hasExpectedColumns = (columns: readonly string[]): boolean =>
  columns.length === CATEGORY_RESULT_COLUMNS.length &&
  CATEGORY_RESULT_COLUMNS.every((expectedColumn, index) => columns[index] === expectedColumn);

const toInteger = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new DbRuntimeError(
      'db_query_failed',
      `Expected "${fieldName}" to be a safe integer in category query results.`,
    );
  }

  return value;
};

const toName = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new DbRuntimeError(
      'db_query_failed',
      'Expected "name" to be a string in category query results.',
    );
  }

  return value;
};

const mapCategoryQueryResult = (results: readonly QueryExecResult[]): readonly CategoryRecord[] => {
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
      'Category query result columns did not match the expected category projection.',
    );
  }

  return firstResult.values.map((row, rowIndex) => {
    if (row.length !== CATEGORY_RESULT_COLUMNS.length) {
      throw new DbRuntimeError(
        'db_query_failed',
        `Category query row at index ${rowIndex} had an unexpected number of columns.`,
      );
    }

    return {
      categoryId: toInteger(row[0], 'category_id'),
      name: toName(row[1]),
    };
  });
};

export interface CategoryQueryService {
  listAllCategories(): readonly CategoryRecord[];
}

export const createCategoryQueryService = (
  dbRuntime: Pick<BrowserDbRuntime, 'exec'>,
): CategoryQueryService => ({
  listAllCategories(): readonly CategoryRecord[] {
    try {
      const results = dbRuntime.exec(ALL_CATEGORIES_SQL);
      return mapCategoryQueryResult(results);
    } catch (error) {
      throw toDbRuntimeError(
        error,
        'db_query_failed',
        'Failed to load all categories from the local SQLite database.',
      );
    }
  },
});

export const appCategoryQueryService = createCategoryQueryService(appBrowserDbRuntime);
