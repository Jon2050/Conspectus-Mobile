// Keeps the transfer-list presentation preference in this browser, independent of database writes.
import type { TransfersRouteTransfer } from './transfersRouteController';

export type TransfersSortOrder = 'oldest-first' | 'newest-first';

const STORAGE_KEY = 'conspectus.transfersSortOrder';

export const readTransfersSortOrder = (): TransfersSortOrder => {
  try {
    if (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(STORAGE_KEY) === 'newest-first'
    ) {
      return 'newest-first';
    }
  } catch {
    // Storage can be unavailable; preserve the existing oldest-first default.
  }
  return 'oldest-first';
};

export const saveTransfersSortOrder = (order: TransfersSortOrder): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, order);
  } catch {
    // Sorting remains usable for this view even when browser persistence is blocked.
  }
};

export const sortTransfers = (
  transfers: readonly TransfersRouteTransfer[],
  order: TransfersSortOrder,
): TransfersRouteTransfer[] => {
  const direction = order === 'newest-first' ? -1 : 1;
  return [...transfers].sort(
    (left, right) =>
      direction *
      (left.bookingDateEpochDay - right.bookingDateEpochDay || left.transferId - right.transferId),
  );
};
