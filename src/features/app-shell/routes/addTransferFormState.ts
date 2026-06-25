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
  /** Raw amount string from the text input (parsed later in M6-03). */
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

/** Converts an ISO date string (YYYY-MM-DD) to an epoch day number. */
export const isoDateToEpochDay = (isoDate: string): number => {
  const utcMs = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
  return Math.floor(utcMs / MILLIS_PER_DAY);
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
