// Verifies ephemeral article ownership and exact signed-cent recalculation during manual regrouping.
import { describe, expect, it } from 'vitest';
import {
  createReceiptReviewDraft,
  moveReceiptReviewItem,
  removeReceiptReviewTransfer,
  receiptReviewTotalCents,
} from './receiptReviewDraft';

const seed = () =>
  createReceiptReviewDraft({
    receiptDate: '2026-10-19',
    buyplace: 'Shop',
    receiptTotalCents: 650,
    currency: 'EUR',
    transfers: [
      {
        name: 'Food',
        amountCents: 450,
        categoryNames: ['Food'],
        items: [
          { index: 0, name: 'Bread', lineTotalCents: 300 },
          { index: 1, name: 'Deposit', lineTotalCents: 25 },
          { index: 2, name: 'Discount', lineTotalCents: -50 },
          { index: 3, name: 'Apples', lineTotalCents: 150 },
          { index: 4, name: 'Deposit', lineTotalCents: 25 },
        ],
      },
      {
        name: 'Household',
        amountCents: 200,
        categoryNames: ['Household'],
        items: [{ index: 5, name: 'Cleaner', lineTotalCents: 200 }],
      },
    ],
  });

describe('receipt review article assignments', () => {
  it('retains duplicate names as distinct receipt lines and copies the transient items', () => {
    const draft = seed();
    expect(draft.transfers[0]?.items.filter((item) => item.name === 'Deposit')).toHaveLength(2);
    expect(receiptReviewTotalCents(draft)).toBe(650);
  });

  it.each([
    [0, '1,50€', '5,00€'],
    [1, '4,25€', '2,25€'],
    [2, '5,00€', '1,50€'],
  ])(
    'moves signed item %s exactly once and recalculates only the affected rows',
    (index, sourceAmount, targetAmount) => {
      const draft = seed();
      const unaffected = { id: 2, name: 'Manual', amount: '7,00€', categoryNames: [], items: [] };
      const next = moveReceiptReviewItem(
        { ...draft, transfers: [...draft.transfers, unaffected] },
        0,
        Number(index),
        1,
      )!;
      expect(next.transfers[0]?.amount).toBe(sourceAmount);
      expect(next.transfers[1]?.amount).toBe(targetAmount);
      expect(next.transfers[2]).toBe(unaffected);
      expect(
        next.transfers
          .flatMap((row) => row.items)
          .map((item) => item.index)
          .sort(),
      ).toEqual([0, 1, 2, 3, 4, 5]);
      expect(draft.transfers[0]?.items).toHaveLength(5);
      expect(next.date).toBe(draft.date);
      expect(next.buyplace).toBe(draft.buyplace);
      expect(next.transfers[0]?.categoryNames).toEqual(['Food']);
    },
  );

  it('recomputes affected manual amounts from their assigned articles', () => {
    const draft = seed();
    const edited = {
      ...draft,
      transfers: draft.transfers.map((row) => ({ ...row, amount: '99,00€' })),
    };
    const next = moveReceiptReviewItem(edited, 0, 1, 1)!;
    expect(next.transfers.map((row) => row.amount)).toEqual(['4,25€', '2,25€']);
  });

  it('permits removal only after the last item has moved and preserves total', () => {
    const original = seed();
    expect(removeReceiptReviewTransfer(original, 0)).toBe(original);
    let next = original;
    for (const item of original.transfers[0]!.items)
      next = moveReceiptReviewItem(next, 0, item.index, 1)!;
    expect(next.transfers[0]).toMatchObject({ items: [], amount: '0,00€' });
    next = removeReceiptReviewTransfer(next, 0);
    expect(next.transfers.map((row) => row.id)).toEqual([1]);
    expect(receiptReviewTotalCents(next)).toBe(650);
  });

  it('allows a temporarily negative group without converting it to a valid positive amount', () => {
    const draft = seed();
    const empty = { id: 2, name: 'New', amount: '', categoryNames: [], items: [] };
    const next = moveReceiptReviewItem(
      { ...draft, transfers: [...draft.transfers, empty] },
      0,
      2,
      2,
    )!;
    expect(next.transfers[2]?.amount).toBe('-0,50€');
    expect(receiptReviewTotalCents(next)).toBeNull();
  });

  it.each([
    [0, 999, 1],
    [0, 0, 0],
    [999, 0, 1],
    [0, 0, 999],
  ])('does not invent unknown assignments (%s,%s,%s)', (source, index, target) => {
    expect(moveReceiptReviewItem(seed(), source, index, target)).toBeNull();
  });

  it('fails safely when the destination sum overflows and keeps the input intact', () => {
    const draft = seed();
    const overflow = {
      ...draft,
      transfers: [
        draft.transfers[0]!,
        {
          ...draft.transfers[1]!,
          items: [{ index: 5, name: 'Limit', lineTotalCents: Number.MAX_SAFE_INTEGER }],
        },
      ],
    };
    expect(moveReceiptReviewItem(overflow, 0, 1, 1)).toBeNull();
    expect(overflow.transfers[0]?.items).toHaveLength(5);
  });
});
