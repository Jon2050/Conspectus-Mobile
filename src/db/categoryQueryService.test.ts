/**
 * Unit tests for the category query service.
 * Ensures that categories are correctly extracted and mapped from the DB runtime.
 */
import { describe, expect, it } from 'vitest';
import { createCategoryQueryService } from './categoryQueryService';
import type { QueryExecResult } from 'sql.js';
import type { BrowserDbRuntime } from './index';

describe('createCategoryQueryService', () => {
  it('maps valid query results correctly', () => {
    const dbRuntime = {
      exec: () => [
        {
          columns: ['category_id', 'name'],
          values: [
            [1, 'Groceries'],
            [2, 'Rent'],
          ],
        } as QueryExecResult,
      ],
    };

    const service = createCategoryQueryService(
      dbRuntime as unknown as Pick<BrowserDbRuntime, 'exec'>,
    );
    const categories = service.listAllCategories();

    expect(categories).toEqual([
      { categoryId: 1, name: 'Groceries' },
      { categoryId: 2, name: 'Rent' },
    ]);
  });

  it('throws when schema columns do not match', () => {
    const dbRuntime = {
      exec: () => [
        {
          columns: ['invalid_id', 'invalid_name'],
          values: [[1, 'Groceries']],
        } as QueryExecResult,
      ],
    };

    const service = createCategoryQueryService(
      dbRuntime as unknown as Pick<BrowserDbRuntime, 'exec'>,
    );

    expect(() => service.listAllCategories()).toThrowError(
      /Category query result columns did not match/,
    );
  });

  it('throws when row length does not match columns length', () => {
    const dbRuntime = {
      exec: () => [
        {
          columns: ['category_id', 'name'],
          values: [[1]],
        } as unknown as QueryExecResult,
      ],
    };

    const service = createCategoryQueryService(
      dbRuntime as unknown as Pick<BrowserDbRuntime, 'exec'>,
    );

    expect(() => service.listAllCategories()).toThrowError(/unexpected number of columns/);
  });

  it('throws when category_id is not a safe integer', () => {
    const dbRuntime = {
      exec: () => [
        {
          columns: ['category_id', 'name'],
          values: [['1', 'Groceries']],
        } as unknown as QueryExecResult,
      ],
    };

    const service = createCategoryQueryService(
      dbRuntime as unknown as Pick<BrowserDbRuntime, 'exec'>,
    );

    expect(() => service.listAllCategories()).toThrowError(
      /Expected "category_id" to be a safe integer/,
    );
  });

  it('throws when name is not a string', () => {
    const dbRuntime = {
      exec: () => [
        {
          columns: ['category_id', 'name'],
          values: [[1, 123]],
        } as unknown as QueryExecResult,
      ],
    };

    const service = createCategoryQueryService(
      dbRuntime as unknown as Pick<BrowserDbRuntime, 'exec'>,
    );

    expect(() => service.listAllCategories()).toThrowError(/Expected "name" to be a string/);
  });
});
