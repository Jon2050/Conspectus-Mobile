import { afterEach, describe, expect, it } from 'vitest';
import {
  createBrowserDbRuntime,
  createTransferMonthQueryService,
  type BrowserDbRuntime,
  type CreateTransferInput,
} from './index';
import { createTransferMutationService } from './transferMutationService';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../shared/testUtils/dbIntegration';

const runtimes: BrowserDbRuntime[] = [];
afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.close()));
const setup = async () => {
  const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
  await runtime.open(loadTransferFixtureBytes());
  runtimes.push(runtime);
  const original = createTransferMonthQueryService(runtime)
    .listTransfersByMonth(19820)
    .find((transfer) => transfer.transferId === 2)!;
  return { runtime, original, service: createTransferMutationService(runtime) };
};
const balances = (runtime: BrowserDbRuntime) =>
  runtime.exec('SELECT account_id, amount FROM account ORDER BY account_id;')[0]?.values;
const replacement: CreateTransferInput = {
  bookingDateEpochDay: 19855,
  name: 'Changed transfer',
  amountCents: 1234,
  fromAccountId: 4,
  toAccountId: 3,
  transferTypeId: 3,
  categoryIds: [3, 2, 1],
  buyplace: 'New shop',
};

describe('transfer mutation service', () => {
  it('replaces every editable field, keeps the ID, and reverses the old account effects', async () => {
    const { runtime, original, service } = await setup();
    service.updateTransfer(original, replacement);
    expect(runtime.exec('SELECT * FROM transfer WHERE transfer_id = 2;')[0]?.values[0]).toEqual([
      2,
      'Changed transfer',
      4,
      3,
      1234,
      3,
      3,
      2,
      1,
      19855,
      'New shop',
    ]);
    expect(balances(runtime)).toEqual([
      [1, 0],
      [2, -4599],
      [3, 60833],
      [4, 6067],
      [5, 8100],
      [6, 2300],
      [7, 1111],
      [8, 1200],
    ]);
    expect(
      createTransferMonthQueryService(runtime)
        .listTransfersByMonth(19820)
        .map((t) => t.transferId),
    ).toEqual([3]);
    expect(
      createTransferMonthQueryService(runtime).listTransfersByMonth(19855)[0]?.transferId,
    ).toBe(2);
  });

  it('clears optional fields and handles swapping the same two accounts', async () => {
    const { runtime, service } = await setup();
    const original = createTransferMonthQueryService(runtime)
      .listTransfersByMonth(19820)
      .find((t) => t.transferId === 3)!;
    service.updateTransfer(original, { ...replacement, categoryIds: [], buyplace: '  ' });
    expect(
      runtime.exec(
        'SELECT category_1_id, category_2_id, category_3_id, buyplace FROM transfer WHERE transfer_id = 3;',
      )[0]?.values[0],
    ).toEqual([null, null, null, null]);
    expect(
      runtime.exec('SELECT amount FROM account WHERE account_id IN (3, 4) ORDER BY account_id;')[0]
        ?.values,
    ).toEqual([[58734], [3567]]);
  });

  it('deletes only the selected transfer and restores both balances', async () => {
    const { runtime, original, service } = await setup();
    service.deleteTransfer(original);
    expect(
      runtime.exec('SELECT transfer_id FROM transfer ORDER BY transfer_id;')[0]?.values,
    ).toEqual([[1], [3]]);
    expect(
      runtime.exec('SELECT amount FROM account WHERE account_id IN (2, 3) ORDER BY account_id;')[0]
        ?.values,
    ).toEqual([[-4599], [59599]]);
  });

  it.each(['update', 'delete'] as const)(
    'rolls back the complete %s when a statement fails',
    async (operation) => {
      const { runtime, original, service } = await setup();
      const before = balances(runtime);
      runtime.exec(
        `CREATE TRIGGER reject_mutation BEFORE ${operation.toUpperCase()} ON transfer BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END;`,
      );
      expect(() =>
        operation === 'update'
          ? service.updateTransfer(original, replacement)
          : service.deleteTransfer(original),
      ).toThrow();
      expect(balances(runtime)).toEqual(before);
      expect(
        createTransferMonthQueryService(runtime)
          .listTransfersByMonth(19820)
          .find((t) => t.transferId === 2),
      ).toEqual(original);
      runtime.exec('DROP TRIGGER reject_mutation;');
      service.deleteTransfer(original); // The failed transaction did not leave the connection locked.
    },
  );

  it.each(['update', 'delete'] as const)(
    'refuses a stale or deleted booking before %s changes balances',
    async (operation) => {
      const { runtime, original, service } = await setup();
      const before = balances(runtime);
      runtime.exec("UPDATE transfer SET name = 'Changed elsewhere' WHERE transfer_id = 2;");
      const mutate = () =>
        operation === 'update'
          ? service.updateTransfer(original, replacement)
          : service.deleteTransfer(original);
      expect(mutate).toThrow('The transfer changed or was deleted');
      expect(balances(runtime)).toEqual(before);
      runtime.exec('DELETE FROM transfer WHERE transfer_id = 2;');
      expect(mutate).toThrow('The transfer changed or was deleted');
      expect(balances(runtime)).toEqual(before);
    },
  );

  it('rolls back a replacement with invalid account or category references', async () => {
    const { runtime, original, service } = await setup();
    const before = balances(runtime);
    expect(() => service.updateTransfer(original, { ...replacement, toAccountId: 9999 })).toThrow();
    expect(() =>
      service.updateTransfer(original, { ...replacement, categoryIds: [9999] }),
    ).toThrow();
    expect(balances(runtime)).toEqual(before);
  });
});
