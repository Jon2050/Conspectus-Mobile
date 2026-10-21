// Editable, ephemeral user input. Model coverage proofs do not describe a manually edited draft.
import {
  formatAmountInputDigits,
  parseAmountInputCents,
} from '../transfers/addTransferAmountInput';
import { sumCents } from '@shared';
import type { ReceiptReviewItem, ReceiptReviewSeed } from './receiptAnalysisContracts';

export interface ReceiptReviewTransfer {
  readonly items: readonly ReceiptReviewItem[];
  readonly id: number;
  readonly name: string;
  readonly amount: string;
  readonly categoryNames: readonly string[];
}
export interface ReceiptReviewDraft {
  readonly date: string;
  readonly buyplace: string;
  readonly receiptTotalCents: number | null;
  readonly currency: string | null;
  readonly transfers: readonly ReceiptReviewTransfer[];
}

export const createReceiptReviewDraft = (seed: ReceiptReviewSeed): ReceiptReviewDraft => ({
  date: seed.receiptDate ?? '',
  buyplace: seed.buyplace ?? '',
  receiptTotalCents: seed.receiptTotalCents,
  currency: seed.currency ?? null,
  transfers: (seed.transfers.length
    ? seed.transfers
    : [{ name: '', amountCents: seed.receiptTotalCents ?? 0, categoryNames: [] }]
  ).map((transfer, id) => ({
    id,
    items: 'items' in transfer ? (transfer.items ?? []).map((item) => ({ ...item })) : [],
    name: transfer.name,
    amount:
      transfer.amountCents === 0
        ? ''
        : (transfer.amountCents < 0 ? '-' : '') +
          formatAmountInputDigits(String(Math.abs(transfer.amountCents))),
    categoryNames: Object.freeze([...transfer.categoryNames]),
  })),
});

export const receiptReviewTotalCents = (draft: ReceiptReviewDraft): number | null => {
  let total = 0;
  for (const transfer of draft.transfers) {
    const amount = parseAmountInputCents(transfer.amount);
    if (amount === null || !Number.isSafeInteger(total + amount)) return null;
    total += amount;
  }
  return total;
};

// Recalculate only the two affected rows; manual edits on other rows remain untouched.
export const moveReceiptReviewItem = (
  draft: ReceiptReviewDraft,
  fromId: number,
  itemIndex: number,
  toId: number,
): ReceiptReviewDraft | null => {
  const source = draft.transfers.find((row) => row.id === fromId);
  const target = draft.transfers.find((row) => row.id === toId);
  const item = source?.items.find((candidate) => candidate.index === itemIndex);
  if (
    !source ||
    !target ||
    !item ||
    source === target ||
    draft.transfers.flatMap((row) => row.items).filter((candidate) => candidate.index === itemIndex)
      .length !== 1
  )
    return null;
  try {
    const updated = [
      { ...source, items: source.items.filter((candidate) => candidate.index !== itemIndex) },
      { ...target, items: [...target.items, item] },
    ].map((row) => {
      const cents = sumCents(row.items.map((candidate) => candidate.lineTotalCents));
      return {
        ...row,
        amount: (cents < 0 ? '-' : '') + formatAmountInputDigits(String(Math.abs(cents))),
      };
    });
    return {
      ...draft,
      transfers: draft.transfers.map(
        (row) => updated.find((candidate) => candidate.id === row.id) ?? row,
      ),
    };
  } catch {
    return null;
  }
};

export const removeReceiptReviewTransfer = (
  draft: ReceiptReviewDraft,
  id: number,
): ReceiptReviewDraft => {
  const row = draft.transfers.find((candidate) => candidate.id === id);
  return !row || row.items.length
    ? draft
    : { ...draft, transfers: draft.transfers.filter((candidate) => candidate.id !== id) };
};
