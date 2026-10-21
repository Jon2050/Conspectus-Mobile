// Editable, ephemeral user input. Model coverage proofs do not describe a manually edited draft.
import {
  formatAmountInputDigits,
  parseAmountInputCents,
} from '../transfers/addTransferAmountInput';
import type { ReceiptReviewSeed } from './receiptAnalysisContracts';

export interface ReceiptReviewTransfer {
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
