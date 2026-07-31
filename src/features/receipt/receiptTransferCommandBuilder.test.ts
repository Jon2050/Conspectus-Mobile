// Verifies exact local receipt mapping, desktop-rule reuse, and fail-closed batch preparation.
import { describe, expect, it } from 'vitest';
import {
  PRIMARY_INCOME_ACCOUNT_TYPE_ID,
  PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  TRANSFER_TYPE_STD_EXPENSE,
} from '@db';

import type { AddTransferOptionsState } from '../app-shell/routes/addTransferOptionsController';
import type { ReceiptTransferDerivation } from './receiptAnalysisContracts';
import {
  buildReceiptTransferCommands,
  listReceiptSourceAccountOptions,
} from './receiptTransferCommandBuilder';

const OPTIONS: AddTransferOptionsState = {
  operation: 'ready',
  fromAccountOptions: [
    { accountId: 1, name: 'Primary Income', accountTypeId: PRIMARY_INCOME_ACCOUNT_TYPE_ID },
    { accountId: 11, name: 'Checking', accountTypeId: 3 },
    { accountId: 12, name: 'Cash', accountTypeId: 4 },
  ],
  toAccountOptions: [
    { accountId: 2, name: 'Primary Spendings', accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID },
    { accountId: 11, name: 'Checking', accountTypeId: 3 },
  ],
  categoryOptions: [
    { categoryId: 20, name: 'Einkauf' },
    { categoryId: 21, name: 'Lebensmittel' },
    { categoryId: 22, name: 'Haushalt' },
  ],
  error: null,
};

const DERIVATION: ReceiptTransferDerivation = {
  status: 'ok',
  errorReason: null,
  receiptTotalCents: 500,
  transfers: [
    {
      name: 'Lebensmittel',
      amountCents: 350,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      buyplace: 'Markt',
      receiptDate: '2026-07-31',
      sourceItemIndexes: [0, 1],
    },
    {
      name: 'Haushaltsartikel',
      amountCents: 150,
      categoryNames: ['Einkauf', 'Haushalt'],
      buyplace: 'Markt',
      receiptDate: '2026-07-31',
      sourceItemIndexes: [2],
    },
  ],
};

describe('receipt transfer command builder', () => {
  it('offers only sources valid for the primary spendings destination', () => {
    expect(listReceiptSourceAccountOptions(OPTIONS)).toEqual([
      { accountId: 11, name: 'Checking', accountTypeId: 3 },
      { accountId: 12, name: 'Cash', accountTypeId: 4 },
    ]);
  });

  it('applies one source to every immutable command and preserves exact category order', () => {
    const result = buildReceiptTransferCommands(DERIVATION, [0, 1, 2], 11, OPTIONS);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.commands).toEqual([
      {
        bookingDateEpochDay: 20665,
        name: 'Lebensmittel',
        amountCents: 350,
        transferTypeId: TRANSFER_TYPE_STD_EXPENSE,
        fromAccountId: 11,
        toAccountId: 2,
        categoryIds: [20, 21],
        buyplace: 'Markt',
      },
      {
        bookingDateEpochDay: 20665,
        name: 'Haushaltsartikel',
        amountCents: 150,
        transferTypeId: TRANSFER_TYPE_STD_EXPENSE,
        fromAccountId: 11,
        toAccountId: 2,
        categoryIds: [20, 22],
        buyplace: 'Markt',
      },
    ]);
    expect(Object.isFrozen(result.commands)).toBe(true);
    expect(Object.isFrozen(result.commands[0]?.categoryIds)).toBe(true);
  });

  it('rejects missing and ambiguous exact category names without trusting an ID', () => {
    const missing = buildReceiptTransferCommands(
      { ...DERIVATION, transfers: [{ ...DERIVATION.transfers[0]!, categoryNames: ['Food'] }] },
      [0, 1],
      11,
      OPTIONS,
    );
    expect(missing).toEqual({
      ok: false,
      error: { code: 'category_not_found', detail: 'Food' },
    });

    const ambiguous = buildReceiptTransferCommands(DERIVATION, [0, 1, 2], 11, {
      ...OPTIONS,
      categoryOptions: [...OPTIONS.categoryOptions, { categoryId: 23, name: 'Einkauf' }],
    });
    expect(ambiguous).toEqual({
      ok: false,
      error: { code: 'category_ambiguous', detail: 'Einkauf' },
    });
  });

  it('rejects stale source and non-unique primary spendings accounts', () => {
    expect(buildReceiptTransferCommands(DERIVATION, [0, 1, 2], 99, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: 'source_account_unavailable' },
    });
    expect(
      buildReceiptTransferCommands(DERIVATION, [0, 1, 2], 11, {
        ...OPTIONS,
        toAccountOptions: [
          ...OPTIONS.toAccountOptions,
          { accountId: 3, name: 'Duplicate', accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: 'primary_spendings_unavailable' } });
  });

  it('revalidates exact item coverage, positive cents, and the receipt total', () => {
    expect(buildReceiptTransferCommands(DERIVATION, [0, 1, 2, 3], 11, OPTIONS)).toMatchObject({
      ok: false,
      error: { code: 'invalid_item_coverage' },
    });
    expect(
      buildReceiptTransferCommands(
        {
          ...DERIVATION,
          transfers: [{ ...DERIVATION.transfers[0]!, amountCents: 0 }],
        },
        [0, 1],
        11,
        OPTIONS,
      ),
    ).toMatchObject({ ok: false, error: { code: 'non_positive_amount' } });
    expect(
      buildReceiptTransferCommands(
        { ...DERIVATION, receiptTotalCents: 501 },
        [0, 1, 2],
        11,
        OPTIONS,
      ),
    ).toMatchObject({ ok: false, error: { code: 'total_mismatch' } });
  });
});
