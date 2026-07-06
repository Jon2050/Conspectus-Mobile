// Implements transfer validation rules from desktop parity.
import { PRIMARY_INCOME_ACCOUNT_TYPE_ID, PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID } from '@db';

import { parseAmountInputCents } from './addTransferAmountInput';
import type { AddTransferAccountOption, AddTransferFormFields } from './addTransferFormState';

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

  if (fields.fromAccountId !== null && fields.toAccountId !== null) {
    const fromAccount = fromAccountOptions.find((a) => a.accountId === fields.fromAccountId);
    const toAccount = toAccountOptions.find((a) => a.accountId === fields.toAccountId);

    if (fromAccount && toAccount) {
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
  }

  return errors;
};
