// Unit tests for the transfer validation rules.
import { describe, expect, it } from 'vitest';
import { PRIMARY_INCOME_ACCOUNT_TYPE_ID, PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID } from '@db';

import type { AddTransferAccountOption, AddTransferFormFields } from './addTransferFormState';
import { createInitialFormFields } from './addTransferFormState';
import { validateAddTransfer } from './addTransferValidation';

describe('validateAddTransfer', () => {
  const t = (key: string) => key;

  const validFields = (): AddTransferFormFields => ({
    ...createInitialFormFields(),
    name: 'Valid Transfer',
    amount: '12,50€',
    fromAccountId: 10,
    toAccountId: 20,
  });

  const fromOptions: AddTransferAccountOption[] = [
    { accountId: 10, name: 'Checking', accountTypeId: 3 },
    { accountId: 1, name: 'Income', accountTypeId: PRIMARY_INCOME_ACCOUNT_TYPE_ID },
    { accountId: 2, name: 'Spendings', accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID },
  ];

  const toOptions: AddTransferAccountOption[] = [
    { accountId: 20, name: 'Savings', accountTypeId: 3 },
    { accountId: 10, name: 'Checking', accountTypeId: 3 },
    { accountId: 1, name: 'Income', accountTypeId: PRIMARY_INCOME_ACCOUNT_TYPE_ID },
    { accountId: 2, name: 'Spendings', accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID },
  ];

  it('returns no errors for valid fields', () => {
    const errors = validateAddTransfer(validFields(), fromOptions, toOptions, t);
    expect(errors).toEqual([]);
  });

  it('requires name length > 2', () => {
    const fields = validFields();
    fields.name = 'ab';
    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.nameLength');
  });

  it('requires a real ISO calendar date', () => {
    for (const date of ['', '2024-2-01', '2024-02-30']) {
      const fields = validFields();
      fields.date = date;

      expect(validateAddTransfer(fields, fromOptions, toOptions, t)).toContain(
        'addTransfer.validation.dateInvalid',
      );
    }
  });

  it('requires amount > 0', () => {
    const fields = validFields();
    fields.amount = '0,00€';
    let errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.amountPositive');

    fields.amount = '-0,10€';
    errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.amountPositive');

    fields.amount = 'invalid';
    errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.amountPositive');
  });

  it('requires from and to accounts to be selected', () => {
    const fields = validFields();
    fields.fromAccountId = null;
    fields.toAccountId = null;
    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.fromAccountRequired');
    expect(errors).toContain('addTransfer.validation.toAccountRequired');
  });

  it('requires from and to accounts to be different', () => {
    const fields = validFields();
    fields.fromAccountId = 10;
    fields.toAccountId = 10;
    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.differentAccounts');
  });

  it('requires selected accounts to remain available in their respective option lists', () => {
    const fields = validFields();
    fields.fromAccountId = 999;
    fields.toAccountId = 998;

    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);

    expect(errors).toContain('addTransfer.validation.fromAccountUnavailable');
    expect(errors).toContain('addTransfer.validation.toAccountUnavailable');
  });

  it('prevents sending from PRIMARY_SPENDINGS', () => {
    const fields = validFields();
    fields.fromAccountId = 2; // PRIMARY_SPENDINGS
    fields.toAccountId = 20;
    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.fromNotSpendings');
  });

  it('prevents receiving to PRIMARY_INCOME', () => {
    const fields = validFields();
    fields.fromAccountId = 10;
    fields.toAccountId = 1; // PRIMARY_INCOME
    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.toNotIncome');
  });

  it('prevents transferring from PRIMARY_INCOME to PRIMARY_SPENDINGS', () => {
    const fields = validFields();
    fields.fromAccountId = 1; // PRIMARY_INCOME
    fields.toAccountId = 2; // PRIMARY_SPENDINGS
    const errors = validateAddTransfer(fields, fromOptions, toOptions, t);
    expect(errors).toContain('addTransfer.validation.incomeToSpendingsInvalid');
  });
});
