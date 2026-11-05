// Implements transfer validation rules from desktop parity.
import { PRIMARY_INCOME_ACCOUNT_TYPE_ID, PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID } from '@db';

import { parseAmountInputCents } from './addTransferAmountInput';
import {
  isValidIsoDate,
  type AddTransferAccountOption,
  type AddTransferFormFields,
} from './addTransferFormState';

export type AddTransferFieldKey = 'date' | 'name' | 'amount' | 'fromAccountId' | 'toAccountId';

export const FIELD_ELEMENT_IDS: Record<AddTransferFieldKey, string> = Object.freeze({
  date: 'add-transfer-date',
  name: 'add-transfer-name',
  amount: 'add-transfer-amount',
  fromAccountId: 'add-transfer-from-account',
  toAccountId: 'add-transfer-to-account',
});

/**
 * Identifies which transfer form fields are invalid or missing.
 */
export const getInvalidAddTransferFields = (
  fields: AddTransferFormFields,
  fromAccountOptions: readonly AddTransferAccountOption[],
  toAccountOptions: readonly AddTransferAccountOption[],
): AddTransferFieldKey[] => {
  const invalidFields = new Set<AddTransferFieldKey>();

  if (!isValidIsoDate(fields.date)) {
    invalidFields.add('date');
  }

  if (fields.name.trim().length <= 2) {
    invalidFields.add('name');
  }

  const amountCents = parseAmountInputCents(fields.amount);
  if (amountCents === null || amountCents <= 0) {
    invalidFields.add('amount');
  }

  if (fields.fromAccountId === null) {
    invalidFields.add('fromAccountId');
  }
  if (fields.toAccountId === null) {
    invalidFields.add('toAccountId');
  }

  const fromAccount = fromAccountOptions.find(
    (account) => account.accountId === fields.fromAccountId,
  );
  const toAccount = toAccountOptions.find((account) => account.accountId === fields.toAccountId);

  if (fields.fromAccountId !== null && fromAccount === undefined) {
    invalidFields.add('fromAccountId');
  }
  if (fields.toAccountId !== null && toAccount === undefined) {
    invalidFields.add('toAccountId');
  }

  if (fromAccount !== undefined && toAccount !== undefined) {
    if (fromAccount.accountId === toAccount.accountId) {
      invalidFields.add('fromAccountId');
      invalidFields.add('toAccountId');
    }

    if (fromAccount.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID) {
      invalidFields.add('fromAccountId');
    }

    if (toAccount.accountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID) {
      invalidFields.add('toAccountId');
    }

    if (
      fromAccount.accountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID &&
      toAccount.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID
    ) {
      invalidFields.add('fromAccountId');
      invalidFields.add('toAccountId');
    }
  }

  return Array.from(invalidFields);
};

/**
 * Validates the transfer form fields against desktop-equivalent rules.
 * Returns an array of translated error messages.
 */
export const validateAddTransfer = (
  fields: AddTransferFormFields,
  fromAccountOptions: readonly AddTransferAccountOption[],
  toAccountOptions: readonly AddTransferAccountOption[],
  t: (key: string) => string,
): string[] => {
  const errors: string[] = [];

  if (!isValidIsoDate(fields.date)) {
    errors.push(t('addTransfer.validation.dateInvalid'));
  }

  if (fields.name.trim().length <= 2) {
    errors.push(t('addTransfer.validation.nameLength'));
  }

  const amountCents = parseAmountInputCents(fields.amount);
  if (amountCents === null || amountCents <= 0) {
    errors.push(t('addTransfer.validation.amountPositive'));
  }

  if (fields.fromAccountId === null) {
    errors.push(t('addTransfer.validation.fromAccountRequired'));
  }
  if (fields.toAccountId === null) {
    errors.push(t('addTransfer.validation.toAccountRequired'));
  }

  const fromAccount = fromAccountOptions.find(
    (account) => account.accountId === fields.fromAccountId,
  );
  const toAccount = toAccountOptions.find((account) => account.accountId === fields.toAccountId);

  if (fields.fromAccountId !== null && fromAccount === undefined) {
    errors.push(t('addTransfer.validation.fromAccountUnavailable'));
  }
  if (fields.toAccountId !== null && toAccount === undefined) {
    errors.push(t('addTransfer.validation.toAccountUnavailable'));
  }

  if (fromAccount !== undefined && toAccount !== undefined) {
    if (fromAccount.accountId === toAccount.accountId) {
      errors.push(t('addTransfer.validation.differentAccounts'));
    }

    if (fromAccount.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID) {
      errors.push(t('addTransfer.validation.fromNotSpendings'));
    }

    if (toAccount.accountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID) {
      errors.push(t('addTransfer.validation.toNotIncome'));
    }

    if (
      fromAccount.accountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID &&
      toAccount.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID
    ) {
      errors.push(t('addTransfer.validation.incomeToSpendingsInvalid'));
    }
  }

  return errors;
};
