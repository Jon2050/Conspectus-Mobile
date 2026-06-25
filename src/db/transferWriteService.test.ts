// Verifies atomic SQLite transfer writes and rollback behavior for Add Transfer persistence.
import { describe, expect, it } from 'vitest';

import {
  createBrowserDbRuntime,
  createTransferWriteService,
  DbRuntimeError,
  TRANSFER_TYPE_INTERN_TRANSFER,
  type BrowserDbRuntime,
  type CreateTransferInput,
} from './index';

import { toEpochDay } from '../shared/testUtils/dateUtils';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../shared/testUtils/dbIntegration';

interface AccountSnapshot {
  readonly amountCents: number;
}

const createRuntimeFromTransferFixture = async (): Promise<BrowserDbRuntime> => {
  const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
  await runtime.open(loadTransferFixtureBytes());
  return runtime;
};

const getAccountSnapshot = (
  runtime: Pick<BrowserDbRuntime, 'exec'>,
  accountId: number,
): AccountSnapshot => {
  const amountCents = runtime.exec('SELECT amount FROM account WHERE account_id = ?;', [
    accountId,
  ])[0]?.values[0]?.[0];

  if (typeof amountCents !== 'number') {
    throw new Error(`Expected account ${accountId} to exist in fixture.`);
  }

  return { amountCents };
};

const countTransfersByName = (runtime: Pick<BrowserDbRuntime, 'exec'>, name: string): number => {
  const count = runtime.exec('SELECT COUNT(*) FROM transfer WHERE name = ?;', [name])[0]
    ?.values[0]?.[0];

  if (typeof count !== 'number') {
    throw new Error(`Expected a numeric transfer count for ${name}.`);
  }

  return count;
};

const getTransferRowById = (runtime: Pick<BrowserDbRuntime, 'exec'>, transferId: number) => {
  const result = runtime.exec(
    `
      SELECT name, from_account, to_account, amount, transfer_type_id,
             category_1_id, category_2_id, category_3_id, date, buyplace
      FROM transfer
      WHERE transfer_id = ?;
    `,
    [transferId],
  );

  return result[0]?.values[0];
};

const createBaseInput = (name: string): CreateTransferInput => ({
  bookingDateEpochDay: toEpochDay(2024, 5, 12),
  name,
  amountCents: 1234,
  transferTypeId: TRANSFER_TYPE_INTERN_TRANSFER,
  fromAccountId: 3,
  toAccountId: 4,
  categoryIds: [1],
  buyplace: 'Corner Store',
});

const expectDbQueryFailed = (writeCall: () => unknown): void => {
  try {
    writeCall();
    throw new Error('Expected transfer write call to throw DbRuntimeError(db_query_failed).');
  } catch (error) {
    expect(error).toBeInstanceOf(DbRuntimeError);
    expect((error as DbRuntimeError).code).toBe('db_query_failed');
  }
};

const expectBalancesAndTransferCountUnchanged = (
  runtime: Pick<BrowserDbRuntime, 'exec'>,
  fromBefore: AccountSnapshot,
  toBefore: AccountSnapshot,
  transferName: string,
): void => {
  expect(getAccountSnapshot(runtime, 3)).toEqual(fromBefore);
  expect(getAccountSnapshot(runtime, 4)).toEqual(toBefore);
  expect(countTransfersByName(runtime, transferName)).toBe(0);
};

describe('transfer write service', () => {
  it('creates a transfer and updates source and destination balances atomically', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferWriteService(runtime);
    const fromBefore = getAccountSnapshot(runtime, 3);
    const toBefore = getAccountSnapshot(runtime, 4);

    const result = service.createTransfer(createBaseInput('Fixture write'));

    expect(result.transferId).toBeGreaterThan(3);
    expect(Date.parse(result.persistedAtIso)).not.toBeNaN();
    expect(getTransferRowById(runtime, result.transferId)).toEqual([
      'Fixture write',
      3,
      4,
      1234,
      TRANSFER_TYPE_INTERN_TRANSFER,
      1,
      null,
      null,
      toEpochDay(2024, 5, 12),
      'Corner Store',
    ]);
    expect(getAccountSnapshot(runtime, 3).amountCents).toBe(fromBefore.amountCents - 1234);
    expect(getAccountSnapshot(runtime, 4).amountCents).toBe(toBefore.amountCents + 1234);
    runtime.close();
  });

  it('persists nullable category and buyplace fields', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferWriteService(runtime);

    const result = service.createTransfer({
      ...createBaseInput('Nullable write'),
      categoryIds: [],
      buyplace: '   ',
    });

    expect(getTransferRowById(runtime, result.transferId)).toEqual([
      'Nullable write',
      3,
      4,
      1234,
      TRANSFER_TYPE_INTERN_TRANSFER,
      null,
      null,
      null,
      toEpochDay(2024, 5, 12),
      null,
    ]);
    runtime.close();
  });

  it('persists three categories in positional order', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferWriteService(runtime);

    const result = service.createTransfer({
      ...createBaseInput('Category write'),
      categoryIds: [1, 2, 3],
    });

    expect(getTransferRowById(runtime, result.transferId)?.slice(5, 8)).toEqual([1, 2, 3]);
    runtime.close();
  });

  it('rolls back when the transfer insert fails', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferWriteService(runtime);
    const fromBefore = getAccountSnapshot(runtime, 3);
    const toBefore = getAccountSnapshot(runtime, 4);

    expectDbQueryFailed(() =>
      service.createTransfer({
        ...createBaseInput('Invalid insert write'),
        transferTypeId: 999,
      }),
    );

    expectBalancesAndTransferCountUnchanged(runtime, fromBefore, toBefore, 'Invalid insert write');
    runtime.close();
  });

  it('rolls back when the source account update fails after insert', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    runtime.exec(`
      CREATE TRIGGER fail_source_account_update
      BEFORE UPDATE ON account
      WHEN OLD.account_id = 3
      BEGIN
        SELECT RAISE(ABORT, 'source update failed');
      END;
    `);
    const service = createTransferWriteService(runtime);
    const fromBefore = getAccountSnapshot(runtime, 3);
    const toBefore = getAccountSnapshot(runtime, 4);

    expectDbQueryFailed(() => service.createTransfer(createBaseInput('Source failure write')));

    expectBalancesAndTransferCountUnchanged(runtime, fromBefore, toBefore, 'Source failure write');
    runtime.close();
  });

  it('rolls back when the destination account update fails after source balance changes', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    runtime.exec(`
      CREATE TRIGGER fail_destination_account_update
      BEFORE UPDATE ON account
      WHEN OLD.account_id = 4
      BEGIN
        SELECT RAISE(ABORT, 'destination update failed');
      END;
    `);
    const service = createTransferWriteService(runtime);
    const fromBefore = getAccountSnapshot(runtime, 3);
    const toBefore = getAccountSnapshot(runtime, 4);

    expectDbQueryFailed(() => service.createTransfer(createBaseInput('Destination failure write')));

    expectBalancesAndTransferCountUnchanged(
      runtime,
      fromBefore,
      toBefore,
      'Destination failure write',
    );
    runtime.close();
  });

  it('resolves a runtime provider on each write call', () => {
    const calls: string[] = [];
    const firstRuntime = {
      exec: (sql: string) => {
        calls.push(`first:${sql.trim()}`);
        return sql.includes('last_insert_rowid')
          ? [{ columns: ['transfer_id'], values: [[11]] }]
          : [];
      },
    };
    const secondRuntime = {
      exec: (sql: string) => {
        calls.push(`second:${sql.trim()}`);
        return sql.includes('last_insert_rowid')
          ? [{ columns: ['transfer_id'], values: [[12]] }]
          : [];
      },
    };
    const runtimes = [firstRuntime, secondRuntime];
    const service = createTransferWriteService(() => runtimes.shift() ?? secondRuntime);

    expect(service.createTransfer(createBaseInput('First')).transferId).toBe(11);
    expect(service.createTransfer(createBaseInput('Second')).transferId).toBe(12);
    expect(calls.filter((call) => call.startsWith('first:BEGIN'))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('second:BEGIN'))).toHaveLength(1);
  });

  it('preserves deterministic closed-runtime failures', async () => {
    const runtime = await createRuntimeFromTransferFixture();
    const service = createTransferWriteService(runtime);
    runtime.close();

    try {
      service.createTransfer(createBaseInput('Closed runtime write'));
      throw new Error('Expected transfer write to fail when runtime is closed.');
    } catch (error) {
      expect(error).toBeInstanceOf(DbRuntimeError);
      expect((error as DbRuntimeError).code).toBe('db_not_open');
    }
  });
});
