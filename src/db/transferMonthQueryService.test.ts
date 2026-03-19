// Verifies transfer-by-month query semantics and epoch-day month bounds with deterministic fixture-backed coverage.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QueryExecResult } from 'sql.js';

import {
  createBrowserDbRuntime,
  createSqlJsLoader,
  createTransferMonthQueryService,
  DbRuntimeError,
  getEpochDayMonthBounds,
  type BrowserDbRuntime,
} from './index';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const toEpochDay = (year: number, month: number, day: number): number =>
  Math.floor(Date.UTC(year, month - 1, day) / MILLIS_PER_DAY);

const resolveNodeWasmPath = (): string =>
  path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

const resolveTransferFixturePath = (): string =>
  path.resolve(process.cwd(), 'tests/fixtures/test.db');

const createNodeSqlJsRuntimeLoader = () =>
  createSqlJsLoader({
    resolveWasmAssetUrl: resolveNodeWasmPath,
  });

const loadTransferFixtureBytes = (): Uint8Array =>
  Uint8Array.from(fs.readFileSync(resolveTransferFixturePath()));

const createRuntimeFromTransferFixture = async (): Promise<
  Pick<BrowserDbRuntime, 'exec' | 'close'>
> => {
  const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
  await runtime.open(loadTransferFixtureBytes());
  return runtime;
};

const expectDbQueryFailed = (queryCall: () => unknown): void => {
  try {
    queryCall();
    throw new Error('Expected transfer query call to throw DbRuntimeError(db_query_failed).');
  } catch (error) {
    expect(error).toBeInstanceOf(DbRuntimeError);
    expect((error as DbRuntimeError).code).toBe('db_query_failed');
  }
};

describe('transfer month query service', () => {
  it('computes inclusive month bounds from an epoch-day anchor', () => {
    expect(getEpochDayMonthBounds(toEpochDay(2024, 4, 10))).toEqual({
      startEpochDay: toEpochDay(2024, 4, 1),
      endEpochDay: toEpochDay(2024, 4, 30),
    });
    expect(getEpochDayMonthBounds(toEpochDay(2024, 2, 29))).toEqual({
      startEpochDay: toEpochDay(2024, 2, 1),
      endEpochDay: toEpochDay(2024, 2, 29),
    });
  });

  it('rejects non-integer epoch-day anchors', () => {
    expectDbQueryFailed(() => getEpochDayMonthBounds(Number.NaN));
  });

  it('returns fixture transfers for March 2024 using inclusive month bounds', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferMonthQueryService(runtime);

    const result = service.listTransfersByMonth(toEpochDay(2024, 3, 15));

    expect(result).toEqual([
      {
        transferId: 1,
        bookingDateEpochDay: toEpochDay(2024, 3, 31),
        name: 'Salary',
        amountCents: 300000,
        fromAccountId: 1,
        toAccountId: 3,
        categoryIds: [],
        buyplace: 'Employer',
      },
    ]);
    runtime.close();
  });

  it('returns fixture transfers for April 2024 sorted by date then transfer_id', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferMonthQueryService(runtime);

    const result = service.listTransfersByMonth(toEpochDay(2024, 4, 1));

    expect(result).toEqual([
      {
        transferId: 2,
        bookingDateEpochDay: toEpochDay(2024, 4, 7),
        name: 'Groceries',
        amountCents: 4599,
        fromAccountId: 3,
        toAccountId: 2,
        categoryIds: [1],
        buyplace: 'Market',
      },
      {
        transferId: 3,
        bookingDateEpochDay: toEpochDay(2024, 4, 10),
        name: 'Wallet top-up',
        amountCents: 2500,
        fromAccountId: 3,
        toAccountId: 4,
        categoryIds: [],
        buyplace: null,
      },
    ]);
    runtime.close();
  });

  it('includes transfer rows that occur exactly on month start and end dates', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    runtime.exec(`
      INSERT INTO transfer (
        transfer_id, name, from_account, to_account, amount, transfer_type_id,
        category_1_id, category_2_id, category_3_id, date, buyplace
      ) VALUES
        (110, 'Month start', 3, 4, 1000, 3, NULL, NULL, NULL, ${toEpochDay(2024, 5, 1)}, NULL),
        (111, 'Month end', 3, 4, 2000, 3, NULL, NULL, NULL, ${toEpochDay(2024, 5, 31)}, NULL),
        (112, 'Outside month', 3, 4, 3000, 3, NULL, NULL, NULL, ${toEpochDay(2024, 6, 1)}, NULL);
    `);
    const service = createTransferMonthQueryService(runtime);

    const mayTransfers = service.listTransfersByMonth(toEpochDay(2024, 5, 20));

    expect(mayTransfers.map((transfer) => transfer.name)).toEqual(['Month start', 'Month end']);
    runtime.close();
  });

  it('applies transfer_id tie-break ordering when transfers share the same date', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    runtime.exec(`
      INSERT INTO transfer (
        transfer_id, name, from_account, to_account, amount, transfer_type_id,
        category_1_id, category_2_id, category_3_id, date, buyplace
      ) VALUES
        (199, 'Tie break later id', 3, 4, 1500, 3, NULL, NULL, NULL, ${toEpochDay(2024, 4, 15)}, NULL),
        (198, 'Tie break earlier id', 3, 4, 1500, 3, NULL, NULL, NULL, ${toEpochDay(2024, 4, 15)}, NULL);
    `);
    const service = createTransferMonthQueryService(runtime);

    const aprilTransfers = service.listTransfersByMonth(toEpochDay(2024, 4, 15));
    const tieBreakRows = aprilTransfers
      .filter((transfer) => transfer.name.startsWith('Tie break'))
      .map((transfer) => transfer.name);

    expect(tieBreakRows).toEqual(['Tie break earlier id', 'Tie break later id']);
    runtime.close();
  });

  it('returns an empty list for months without transfers', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferMonthQueryService(runtime);

    expect(service.listTransfersByMonth(toEpochDay(2023, 1, 12))).toEqual([]);
    runtime.close();
  });

  it('rejects results when expected query columns are missing or renamed', () => {
    const service = createTransferMonthQueryService({
      exec: () =>
        [
          {
            columns: [
              'transfer_id',
              'date',
              'name',
              'amount_cents',
              'from_account',
              'to_account',
              'category_1_id',
              'category_2_id',
              'category_3_id',
              'buyplace',
            ],
            values: [[1, toEpochDay(2024, 4, 7), 'Groceries', 4599, 3, 2, 1, null, null, 'Market']],
          } as unknown as QueryExecResult,
        ] as readonly QueryExecResult[],
    });

    expectDbQueryFailed(() => service.listTransfersByMonth(toEpochDay(2024, 4, 1)));
  });

  it('rejects query rows with invalid field types', () => {
    const service = createTransferMonthQueryService({
      exec: () =>
        [
          {
            columns: [
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
            ],
            values: [
              ['bad', toEpochDay(2024, 4, 1), 'Groceries', 4599, 3, 2, 1, null, null, 'Market'],
              [2, toEpochDay(2024, 4, 2), 123, 2200, 3, 2, null, null, null, 'Store'],
              [
                3,
                toEpochDay(2024, 4, 3),
                'Good',
                Number.POSITIVE_INFINITY,
                3,
                2,
                null,
                null,
                null,
                7,
              ],
            ],
          } as unknown as QueryExecResult,
        ] as readonly QueryExecResult[],
    });

    expectDbQueryFailed(() => service.listTransfersByMonth(toEpochDay(2024, 4, 1)));
  });

  it('rejects query rows with unexpected column counts', () => {
    const service = createTransferMonthQueryService({
      exec: () =>
        [
          {
            columns: [
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
            ],
            values: [[1, toEpochDay(2024, 4, 7), 'Groceries', 4599, 3, 2, 1, null]],
          } as unknown as QueryExecResult,
        ] as readonly QueryExecResult[],
    });

    expectDbQueryFailed(() => service.listTransfersByMonth(toEpochDay(2024, 4, 1)));
  });
});
