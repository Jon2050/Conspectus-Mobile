// Verifies account query filtering/sorting and strict row parsing for typed account read models.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QueryExecResult, SqlJsStatic } from 'sql.js';

import {
  createAccountQueryService,
  createBrowserDbRuntime,
  createSqlJsLoader,
  DbRuntimeError,
  type BrowserDbRuntime,
} from './index';

interface AccountFixtureRow {
  readonly accountId: number;
  readonly name: string;
  readonly amountCents: number;
  readonly acOrder: number;
  readonly acTypeId: number;
  readonly visible: 0 | 1;
}

const resolveNodeWasmPath = (): string =>
  path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

const createNodeSqlJsRuntimeLoader = () =>
  createSqlJsLoader({
    resolveWasmAssetUrl: resolveNodeWasmPath,
  });

const createFixtureSnapshotBytes = async (
  accountRows: readonly AccountFixtureRow[],
): Promise<Uint8Array> => {
  const sqlJsRuntime: SqlJsStatic = await createNodeSqlJsRuntimeLoader().load();
  const database = new sqlJsRuntime.Database();

  database.exec(`
    CREATE TABLE account (
      account_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      ac_order INTEGER NOT NULL,
      ac_type_id INTEGER,
      visible BOOLEAN DEFAULT TRUE
    );
  `);

  for (const row of accountRows) {
    database.run(
      `
        INSERT INTO account (account_id, name, amount, ac_order, ac_type_id, visible)
        VALUES (?, ?, ?, ?, ?, ?);
      `,
      [row.accountId, row.name, row.amountCents, row.acOrder, row.acTypeId, row.visible],
    );
  }

  const bytes = database.export();
  database.close();
  return bytes;
};

const createRuntimeWithFixtureRows = async (
  accountRows: readonly AccountFixtureRow[],
): Promise<Pick<BrowserDbRuntime, 'exec' | 'close'>> => {
  const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
  await runtime.open(await createFixtureSnapshotBytes(accountRows));
  return runtime;
};

const expectDbQueryFailed = (queryCall: () => unknown): void => {
  try {
    queryCall();
    throw new Error('Expected account query call to throw DbRuntimeError(db_query_failed).');
  } catch (error) {
    expect(error).toBeInstanceOf(DbRuntimeError);
    expect((error as DbRuntimeError).code).toBe('db_query_failed');
  }
};

describe('account query service', () => {
  it('returns visible non-primary accounts sorted by ac_order, lower(name), and account_id', async () => {
    const runtime = await createRuntimeWithFixtureRows([
      { accountId: 10, name: 'Bravo', amountCents: 5400, acOrder: 2, acTypeId: 3, visible: 1 },
      { accountId: 11, name: 'alpha', amountCents: 8100, acOrder: 1, acTypeId: 3, visible: 1 },
      { accountId: 12, name: 'Alpha', amountCents: 2300, acOrder: 1, acTypeId: 3, visible: 1 },
      {
        accountId: 13,
        name: 'Primary Income',
        amountCents: 9999,
        acOrder: 0,
        acTypeId: 1,
        visible: 1,
      },
      {
        accountId: 14,
        name: 'Primary Spendings',
        amountCents: 9999,
        acOrder: 0,
        acTypeId: 2,
        visible: 1,
      },
      { accountId: 15, name: 'Hidden', amountCents: 1111, acOrder: 1, acTypeId: 3, visible: 0 },
      { accountId: 16, name: 'alpha', amountCents: 1200, acOrder: 1, acTypeId: 3, visible: 1 },
    ]);
    const service = createAccountQueryService(runtime);

    const result = service.listVisibleNonPrimaryAccounts();

    expect(result).toEqual([
      { accountId: 11, name: 'alpha', amountCents: 8100 },
      { accountId: 12, name: 'Alpha', amountCents: 2300 },
      { accountId: 16, name: 'alpha', amountCents: 1200 },
      { accountId: 10, name: 'Bravo', amountCents: 5400 },
    ]);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual(['accountId', 'amountCents', 'name']);
    runtime.close();
  });

  it('returns an empty list when no visible non-primary accounts exist', async () => {
    const runtime = await createRuntimeWithFixtureRows([
      { accountId: 1, name: 'Primary Income', amountCents: 0, acOrder: 0, acTypeId: 1, visible: 1 },
      {
        accountId: 2,
        name: 'Primary Spendings',
        amountCents: 0,
        acOrder: 0,
        acTypeId: 2,
        visible: 1,
      },
      {
        accountId: 3,
        name: 'Hidden Wallet',
        amountCents: 500,
        acOrder: 3,
        acTypeId: 3,
        visible: 0,
      },
    ]);
    const service = createAccountQueryService(runtime);

    expect(service.listVisibleNonPrimaryAccounts()).toEqual([]);
    runtime.close();
  });

  it('rejects results when expected query columns are missing or renamed', () => {
    const service = createAccountQueryService({
      exec: () =>
        [
          {
            columns: ['account_id', 'name', 'amount_cents'],
            values: [[10, 'Cash', 900]],
          } as unknown as QueryExecResult,
        ] as readonly QueryExecResult[],
    });

    expectDbQueryFailed(() => service.listVisibleNonPrimaryAccounts());
  });

  it('rejects query rows with invalid field types', () => {
    const service = createAccountQueryService({
      exec: () =>
        [
          {
            columns: ['account_id', 'name', 'amount'],
            values: [
              ['not-a-number', 'Cash', 900],
              [11, 123, 700],
              [12, 'Safe', Number.POSITIVE_INFINITY],
            ],
          } as unknown as QueryExecResult,
        ] as readonly QueryExecResult[],
    });

    expectDbQueryFailed(() => service.listVisibleNonPrimaryAccounts());
  });

  it('rejects query rows with unexpected column counts', () => {
    const service = createAccountQueryService({
      exec: () =>
        [
          {
            columns: ['account_id', 'name', 'amount'],
            values: [[10, 'Cash']],
          } as unknown as QueryExecResult,
        ] as readonly QueryExecResult[],
    });

    expectDbQueryFailed(() => service.listVisibleNonPrimaryAccounts());
  });
});
