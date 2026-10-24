import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readTransfersSortOrder,
  saveTransfersSortOrder,
  sortTransfers,
} from './transfersSortOrder';
import type { TransfersRouteTransfer } from './transfersRouteController';

afterEach(() => vi.unstubAllGlobals());

describe('transfer sort preference', () => {
  it('defaults to the existing oldest-first order without browser storage', () => {
    expect(readTransfersSortOrder()).toBe('oldest-first');
  });

  it('restores both saved orders and tolerates invalid values', () => {
    let stored: string | null = null;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => stored,
        setItem: (_key: string, value: string) => {
          stored = value;
        },
      },
    });
    for (const order of ['newest-first', 'oldest-first'] as const) {
      saveTransfersSortOrder(order);
      expect(readTransfersSortOrder()).toBe(order);
    }
    stored = 'invalid';
    expect(readTransfersSortOrder()).toBe('oldest-first');
  });

  it('tolerates denied access to localStorage itself', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Storage blocked');
      },
    });
    expect(readTransfersSortOrder()).toBe('oldest-first');
    expect(() => saveTransfersSortOrder('newest-first')).not.toThrow();
  });

  it('tolerates failed storage reads and writes', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('Read blocked');
        },
        setItem: () => {
          throw new Error('Write blocked');
        },
      },
    });
    expect(readTransfersSortOrder()).toBe('oldest-first');
    expect(() => saveTransfersSortOrder('newest-first')).not.toThrow();
  });

  it('sorts by booking date then ID in both directions without changing the source', () => {
    const transfer = (transferId: number, bookingDateEpochDay: number): TransfersRouteTransfer => ({
      transferId,
      bookingDateEpochDay,
      name: 'Transfer',
      amountCents: 100,
      amountSemantic: 'neutral',
      fromAccountName: 'Checking',
      toAccountName: 'Wallet',
      categoryNames: [],
      buyplace: null,
      fromAccountTypeId: 3,
      toAccountTypeId: 3,
    });
    const transfers = Object.freeze([transfer(2, 20002), transfer(9, 20001), transfer(1, 20002)]);
    expect(sortTransfers(transfers, 'oldest-first').map((item) => item.transferId)).toEqual([
      9, 1, 2,
    ]);
    expect(sortTransfers(transfers, 'newest-first').map((item) => item.transferId)).toEqual([
      2, 1, 9,
    ]);
    expect(transfers.map((item) => item.transferId)).toEqual([2, 9, 1]);
  });
});
