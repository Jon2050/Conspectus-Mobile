// Unit tests for the transfer type derivation logic.
import { describe, it, expect } from 'vitest';
import { deriveTransferType } from './transferTypeDerivation';
import {
  PRIMARY_INCOME_ACCOUNT_TYPE_ID,
  PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  TRANSFER_TYPE_STD_EXPENSE,
  TRANSFER_TYPE_STD_EARNING,
  TRANSFER_TYPE_INTERN_TRANSFER,
} from '@db';

describe('deriveTransferType', () => {
  it('returns STD_EXPENSE if `to` account is primary income', () => {
    expect(deriveTransferType(null, PRIMARY_INCOME_ACCOUNT_TYPE_ID)).toBe(
      TRANSFER_TYPE_STD_EXPENSE,
    );
  });

  it('returns STD_EXPENSE if `to` account is primary spendings', () => {
    expect(deriveTransferType(null, PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID)).toBe(
      TRANSFER_TYPE_STD_EXPENSE,
    );
  });

  it('returns STD_EARNING if `to` is non-primary and `from` is primary income', () => {
    expect(deriveTransferType(PRIMARY_INCOME_ACCOUNT_TYPE_ID, null)).toBe(
      TRANSFER_TYPE_STD_EARNING,
    );
  });

  it('returns STD_EARNING if `to` is non-primary and `from` is primary spendings', () => {
    expect(deriveTransferType(PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID, null)).toBe(
      TRANSFER_TYPE_STD_EARNING,
    );
  });

  it('returns STD_EXPENSE if both `to` and `from` are primary (to wins)', () => {
    expect(
      deriveTransferType(PRIMARY_INCOME_ACCOUNT_TYPE_ID, PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID),
    ).toBe(TRANSFER_TYPE_STD_EXPENSE);
  });

  it('returns INTERN_TRANSFER if neither `from` nor `to` is primary', () => {
    expect(deriveTransferType(null, null)).toBe(TRANSFER_TYPE_INTERN_TRANSFER);
  });

  it('returns INTERN_TRANSFER if inputs are undefined', () => {
    expect(deriveTransferType(undefined, undefined)).toBe(TRANSFER_TYPE_INTERN_TRANSFER);
  });

  it('returns INTERN_TRANSFER if inputs are non-primary numbers', () => {
    expect(deriveTransferType(999, 888)).toBe(TRANSFER_TYPE_INTERN_TRANSFER);
  });
});
