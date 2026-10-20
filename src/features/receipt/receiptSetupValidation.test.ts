import { describe, expect, it } from 'vitest';
import type { AddTransferOptionsState } from '../transfers/transferOptions';
import {
  DEFAULT_RECEIPT_CATEGORY_NAMES,
  DEFAULT_TRANSFER_DERIVATION_RULES,
} from './prompts/transferDerivationPrompt';
import { validateReceiptSetup } from './receiptSetupValidation';

const options: AddTransferOptionsState = {
  operation: 'ready',
  fromAccountOptions: [{ accountId: 3, name: 'Bank', accountTypeId: 3 }],
  toAccountOptions: [{ accountId: 2, name: 'Spendings', accountTypeId: 2 }],
  categoryOptions: DEFAULT_RECEIPT_CATEGORY_NAMES.map((name, index) => ({
    categoryId: index + 1,
    name,
  })),
  error: null,
};

describe('receipt setup preflight', () => {
  it('keeps default category metadata aligned with the actual shipped rules', () => {
    const names = [...DEFAULT_TRANSFER_DERIVATION_RULES.text.matchAll(/\[([^\]]+)\]/gu)].map(
      (match) => match[1],
    );
    expect(new Set(names)).toEqual(new Set(DEFAULT_RECEIPT_CATEGORY_NAMES));
    expect(validateReceiptSetup(options, true)).toBeNull();
  });
  it('rejects missing and ambiguous default categories before any provider work', () => {
    expect(validateReceiptSetup({ ...options, categoryOptions: [] }, true)).toEqual({
      code: 'category_not_found',
      detail: 'Einkauf',
    });
    expect(
      validateReceiptSetup(
        {
          ...options,
          categoryOptions: [...options.categoryOptions, { categoryId: 40, name: 'Einkauf' }],
        },
        true,
      ),
    ).toEqual({ code: 'category_ambiguous', detail: 'Einkauf' });
  });
  it('does not impose default categories on opaque custom rules but still requires valid accounts', () => {
    expect(validateReceiptSetup({ ...options, categoryOptions: [] }, false)).toBeNull();
    expect(validateReceiptSetup({ ...options, toAccountOptions: [] }, false)?.code).toBe(
      'primary_spendings_unavailable',
    );
    expect(validateReceiptSetup({ ...options, fromAccountOptions: [] }, false)?.code).toBe(
      'source_account_unavailable',
    );
  });
});
