/**
 * Unit tests for the category query service.
 * Ensures that categories are correctly extracted and mapped from the DB runtime.
 */
import { describe, expect, it, vi } from 'vitest';
import type { QueryExecResult } from 'sql.js';
import { createBrowserDbRuntime, createCategoryQueryService, type BrowserDbRuntime } from './index';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../shared/testUtils/dbIntegration';

describe('createCategoryQueryService', () => {
  it('loads categories sorted by name from the tracked SQLite fixture', async () => {
    const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
    await runtime.open(loadTransferFixtureBytes());
    const service = createCategoryQueryService(runtime);

    expect(service.listAllCategories()).toEqual([
      { categoryId: 1, name: 'Groceries' },
      { categoryId: 3, name: 'Leisure' },
      { categoryId: 2, name: 'Rent' },
    ]);

    runtime.close();
  });

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

  it('requests categories in case-insensitive name order', () => {
    const exec = vi.fn(() => [] as readonly QueryExecResult[]);
    const service = createCategoryQueryService({ exec });

    service.listAllCategories();

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('ORDER BY LOWER(name) ASC'));
  });

  it('resolves a runtime provider on each service call', () => {
    const firstRuntime = {
      exec: vi.fn(() => [
        {
          columns: ['category_id', 'name'],
          values: [[1, 'First']],
        } as QueryExecResult,
      ]),
    };
    const secondRuntime = {
      exec: vi.fn(() => [
        {
          columns: ['category_id', 'name'],
          values: [[2, 'Second']],
        } as QueryExecResult,
      ]),
    };
    let runtime = firstRuntime;
    const service = createCategoryQueryService(() => runtime);

    expect(service.listAllCategories()[0]?.name).toBe('First');
    runtime = secondRuntime;
    expect(service.listAllCategories()[0]?.name).toBe('Second');
    expect(firstRuntime.exec).toHaveBeenCalledTimes(1);
    expect(secondRuntime.exec).toHaveBeenCalledTimes(1);
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
