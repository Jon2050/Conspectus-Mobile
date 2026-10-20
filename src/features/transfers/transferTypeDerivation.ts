// Implements the business logic to derive the transfer type ID based on the selected accounts.
import {
  PRIMARY_INCOME_ACCOUNT_TYPE_ID,
  PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  TRANSFER_TYPE_STD_EXPENSE,
  TRANSFER_TYPE_STD_EARNING,
  TRANSFER_TYPE_INTERN_TRANSFER,
} from '@db';

/**
 * Derives the transfer type ID based on the desktop rules:
 * - If receiving account (`to`) is primary -> STD_EXPENSE (1)
 * - Else if spending account (`from`) is primary -> STD_EARNING (2)
 * - Else -> INTERN_TRANSFER (3)
 */
export function deriveTransferType(
  fromAccountTypeId: number | null | undefined,
  toAccountTypeId: number | null | undefined,
): number {
  const isPrimary = (typeId: number | null | undefined) =>
    typeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID || typeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID;

  if (isPrimary(toAccountTypeId)) {
    return TRANSFER_TYPE_STD_EXPENSE;
  }

  if (isPrimary(fromAccountTypeId)) {
    return TRANSFER_TYPE_STD_EARNING;
  }

  return TRANSFER_TYPE_INTERN_TRANSFER;
}
