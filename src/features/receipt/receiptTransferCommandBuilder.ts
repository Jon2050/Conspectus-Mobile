// Converts validated receipt derivations into immutable desktop-compatible transfer commands.
import { PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID, type CreateTransferInput } from '@db';

import {
  isoDateToEpochDay,
  type AddTransferAccountOption,
  type AddTransferFormFields,
} from '../app-shell/routes/addTransferFormState';
import { formatAmountInputDigits } from '../app-shell/routes/addTransferAmountInput';
import type { AddTransferOptionsState } from '../app-shell/routes/addTransferOptionsController';
import { validateAddTransfer } from '../app-shell/routes/addTransferValidation';
import { deriveTransferType } from '../app-shell/routes/transferTypeDerivation';
import type { ReceiptTransferDerivation } from './receiptAnalysisContracts';

export type ReceiptTransferPreparationErrorCode =
  | 'options_unavailable'
  | 'offline'
  | 'source_account_unavailable'
  | 'primary_spendings_unavailable'
  | 'category_not_found'
  | 'category_ambiguous'
  | 'invalid_transfer'
  | 'invalid_item_coverage'
  | 'non_positive_amount'
  | 'total_mismatch';

export interface ReceiptTransferPreparationError {
  readonly code: ReceiptTransferPreparationErrorCode;
  readonly detail: string | null;
}

export type ReceiptTransferCommandBuildResult =
  | { readonly ok: true; readonly commands: readonly CreateTransferInput[] }
  | { readonly ok: false; readonly error: ReceiptTransferPreparationError };

const failure = (
  code: ReceiptTransferPreparationErrorCode,
  detail: string | null = null,
): ReceiptTransferCommandBuildResult => ({ ok: false, error: { code, detail } });

const findPrimarySpendingsAccount = (
  optionsState: AddTransferOptionsState,
): AddTransferAccountOption | null => {
  const matches = optionsState.toAccountOptions.filter(
    (account) => account.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
};

const createValidationFields = (
  source: AddTransferAccountOption,
  destination: AddTransferAccountOption,
  transfer: ReceiptTransferDerivation['transfers'][number],
): AddTransferFormFields => ({
  date: transfer.receiptDate,
  name: transfer.name,
  amount: formatAmountInputDigits(String(transfer.amountCents)),
  fromAccountId: source.accountId,
  toAccountId: destination.accountId,
  category1Id: -1,
  category2Id: -1,
  category3Id: -1,
  buyplace: transfer.buyplace,
});

const hasSafeExactCoverage = (
  derivation: ReceiptTransferDerivation,
  expectedItemIndexes: readonly number[],
): boolean => {
  if (expectedItemIndexes.length === 0) {
    return false;
  }

  const expected = new Set<number>();
  for (const index of expectedItemIndexes) {
    if (!Number.isSafeInteger(index) || index < 0 || expected.has(index)) {
      return false;
    }
    expected.add(index);
  }

  const covered = new Set<number>();
  for (const transfer of derivation.transfers) {
    if (!Array.isArray(transfer.sourceItemIndexes) || transfer.sourceItemIndexes.length === 0) {
      return false;
    }
    for (const index of transfer.sourceItemIndexes) {
      if (!Number.isSafeInteger(index) || !expected.has(index) || covered.has(index)) {
        return false;
      }
      covered.add(index);
    }
  }

  return covered.size === expected.size;
};

export const listReceiptSourceAccountOptions = (
  optionsState: AddTransferOptionsState,
): readonly AddTransferAccountOption[] => {
  if (optionsState.operation !== 'ready') {
    return [];
  }
  const destination = findPrimarySpendingsAccount(optionsState);
  if (destination === null) {
    return [];
  }

  return optionsState.fromAccountOptions.filter((source) => {
    const fields: AddTransferFormFields = {
      date: '2026-01-01',
      name: 'Receipt',
      amount: '0,01€',
      fromAccountId: source.accountId,
      toAccountId: destination.accountId,
      category1Id: -1,
      category2Id: -1,
      category3Id: -1,
      buyplace: '',
    };
    return (
      validateAddTransfer(
        fields,
        optionsState.fromAccountOptions,
        optionsState.toAccountOptions,
        (key) => key,
      ).length === 0
    );
  });
};

export const validateReceiptSourceAccountTopology = (
  optionsState: AddTransferOptionsState,
): ReceiptTransferPreparationError | null => {
  if (optionsState.operation !== 'ready') {
    return { code: 'options_unavailable', detail: null };
  }
  if (findPrimarySpendingsAccount(optionsState) === null) {
    return { code: 'primary_spendings_unavailable', detail: null };
  }
  if (listReceiptSourceAccountOptions(optionsState).length === 0) {
    return { code: 'source_account_unavailable', detail: null };
  }
  return null;
};

export const buildReceiptTransferCommands = (
  derivation: ReceiptTransferDerivation,
  expectedItemIndexes: readonly number[],
  sourceAccountId: number,
  optionsState: AddTransferOptionsState,
): ReceiptTransferCommandBuildResult => {
  if (optionsState.operation !== 'ready') {
    return failure('options_unavailable');
  }

  const destination = findPrimarySpendingsAccount(optionsState);
  if (destination === null) {
    return failure('primary_spendings_unavailable');
  }

  const validSources = listReceiptSourceAccountOptions(optionsState);
  const sourceMatches = validSources.filter((account) => account.accountId === sourceAccountId);
  if (sourceMatches.length !== 1) {
    return failure('source_account_unavailable');
  }
  const source = sourceMatches[0];
  if (source === undefined) {
    return failure('source_account_unavailable');
  }

  if (
    !Number.isSafeInteger(derivation.receiptTotalCents) ||
    derivation.receiptTotalCents <= 0 ||
    !Array.isArray(derivation.transfers) ||
    derivation.transfers.length === 0
  ) {
    return failure('total_mismatch');
  }
  if (!hasSafeExactCoverage(derivation, expectedItemIndexes)) {
    return failure('invalid_item_coverage');
  }

  const categoriesByName = new Map<string, number[]>();
  for (const category of optionsState.categoryOptions) {
    const matches = categoriesByName.get(category.name) ?? [];
    matches.push(category.categoryId);
    categoriesByName.set(category.name, matches);
  }

  let totalCents = 0;
  const commands: CreateTransferInput[] = [];
  for (const transfer of derivation.transfers) {
    if (
      typeof transfer.name !== 'string' ||
      typeof transfer.buyplace !== 'string' ||
      typeof transfer.receiptDate !== 'string'
    ) {
      return failure('invalid_transfer');
    }
    if (!Number.isSafeInteger(transfer.amountCents) || transfer.amountCents <= 0) {
      return failure('non_positive_amount');
    }
    const nextTotal = totalCents + transfer.amountCents;
    if (!Number.isSafeInteger(nextTotal)) {
      return failure('total_mismatch');
    }
    totalCents = nextTotal;

    if (
      !Array.isArray(transfer.categoryNames) ||
      transfer.categoryNames.length > 3 ||
      transfer.categoryNames.some((categoryName: unknown) => typeof categoryName !== 'string')
    ) {
      return failure('invalid_transfer');
    }
    const categoryIds: number[] = [];
    for (const categoryName of transfer.categoryNames) {
      const matches = categoriesByName.get(categoryName) ?? [];
      if (matches.length === 0) {
        return failure('category_not_found', categoryName);
      }
      if (matches.length !== 1) {
        return failure('category_ambiguous', categoryName);
      }
      const categoryId = matches[0];
      if (categoryId === undefined) {
        return failure('category_not_found', categoryName);
      }
      categoryIds.push(categoryId);
    }

    const fields = createValidationFields(source, destination, transfer);
    const validationErrors = validateAddTransfer(
      fields,
      optionsState.fromAccountOptions,
      optionsState.toAccountOptions,
      (key) => key,
    );
    if (validationErrors.length > 0) {
      return failure('invalid_transfer', validationErrors[0] ?? null);
    }

    let bookingDateEpochDay: number;
    try {
      bookingDateEpochDay = isoDateToEpochDay(transfer.receiptDate);
    } catch {
      return failure('invalid_transfer', 'addTransfer.validation.dateInvalid');
    }

    commands.push(
      Object.freeze({
        bookingDateEpochDay,
        name: transfer.name.trim(),
        amountCents: transfer.amountCents,
        transferTypeId: deriveTransferType(source.accountTypeId, destination.accountTypeId),
        fromAccountId: source.accountId,
        toAccountId: destination.accountId,
        categoryIds: Object.freeze([...categoryIds]),
        buyplace: transfer.buyplace.trim().length > 0 ? transfer.buyplace.trim() : null,
      }),
    );
  }

  if (totalCents !== derivation.receiptTotalCents) {
    return failure('total_mismatch');
  }

  return { ok: true, commands: Object.freeze(commands) };
};
