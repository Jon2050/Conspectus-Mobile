// Defines the Add Transfer form field model, option shapes, and initial-state factory.
// M6-01 scope: UI form shell only. Validation (M6-03) and submission (M6-05) are separate.
import { MILLIS_PER_DAY } from '@shared';

/** A selectable account option for the from/to dropdowns. */
export interface AddTransferAccountOption {
  readonly accountId: number;
  readonly name: string;
  readonly accountTypeId: number | null;
}

/** A selectable category option for the category dropdowns. */
export interface AddTransferCategoryOption {
  readonly categoryId: number;
  readonly name: string;
}

/** Sentinel value for "no category selected" in category dropdowns. */
export const NO_CATEGORY_SELECTED = -1;

/** Shape of form field values managed by the Add Transfer bottom sheet. */
export interface AddTransferFormFields {
  /** ISO date string (YYYY-MM-DD) for native date input binding. */
  date: string;
  name: string;
  /** Formatted euro-cent amount display string such as 12,34€. */
  amount: string;
  fromAccountId: number | null;
  toAccountId: number | null;
  category1Id: number;
  category2Id: number;
  category3Id: number;
  buyplace: string;
}

/** Returns today's date as an ISO date string (YYYY-MM-DD) in local time. */
export const getTodayIsoDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Returns whether a string is a real ISO calendar date in YYYY-MM-DD form. */
export const isValidIsoDate = (isoDate: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return false;
  }

  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate;
};

/** Converts a validated ISO date string (YYYY-MM-DD) to an epoch day number. */
export const isoDateToEpochDay = (isoDate: string): number => {
  if (!isValidIsoDate(isoDate)) {
    throw new RangeError('A valid ISO calendar date is required.');
  }

  return Math.floor(Date.parse(`${isoDate}T00:00:00.000Z`) / MILLIS_PER_DAY);
};

/** Creates a fresh set of form field values defaulting to today's date. */
export const createInitialFormFields = (): AddTransferFormFields => ({
  date: getTodayIsoDate(),
  name: '',
  amount: '',
  fromAccountId: null,
  toAccountId: null,
  category1Id: NO_CATEGORY_SELECTED,
  category2Id: NO_CATEGORY_SELECTED,
  category3Id: NO_CATEGORY_SELECTED,
  buyplace: '',
});
