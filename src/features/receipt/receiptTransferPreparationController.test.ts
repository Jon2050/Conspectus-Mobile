// Verifies editable review, explicit Save, immutable handoff and transient cleanup.
import { describe, expect, it } from 'vitest';
import { PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID } from '@db';

import type { AddTransferOptionsState } from '../transfers/transferOptions';
import type { ReceiptAnalysisState } from './receiptAnalysisController';
import { moveReceiptReviewItem } from './receiptReviewDraft';
import { createReceiptTransferPreparationController } from './receiptTransferPreparationController';

const OPTIONS: AddTransferOptionsState = {
  operation: 'ready',
  fromAccountOptions: [{ accountId: 11, name: 'Checking', accountTypeId: 3 }],
  toAccountOptions: [
    { accountId: 2, name: 'Primary Spendings', accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID },
  ],
  categoryOptions: [{ categoryId: 20, name: 'Einkauf' }],
  error: null,
};

const SUCCEEDED: ReceiptAnalysisState = {
  phase: 'succeeded',
  stage: null,
  errorCode: null,
  errorReason: null,
  derivation: {
    status: 'ok',
    errorReason: null,
    receiptTotalCents: 350,
    transfers: [
      {
        name: 'Lebensmittel',
        amountCents: 350,
        categoryNames: ['Einkauf'],
        buyplace: 'Markt',
        receiptDate: '2026-07-31',
        sourceItemIndexes: [0],
      },
    ],
  },
  extractedItemIndexes: [0],
};

const DERIVING: ReceiptAnalysisState = {
  phase: 'deriving',
  stage: 'derivation',
  errorCode: null,
  errorReason: null,
  derivation: null,
  extractedItemIndexes: null,
};

describe('receipt transfer preparation controller', () => {
  const ready = (early = false) => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    if (early) controller.selectSourceAccount(11, OPTIONS);
    controller.handleAnalysisState(SUCCEEDED, OPTIONS);
    return controller;
  };
  it.each([true, false])(
    'never prepares commands until explicit Save (early source: %s)',
    (early) => {
      const controller = ready(early);
      if (!early) controller.selectSourceAccount(11, OPTIONS);
      expect(controller.getState()).toMatchObject({ phase: 'reviewing', readyForCommit: null });
      expect(controller.claimReadyForCommit()).toBeNull();
      controller.prepareForSave(OPTIONS);
      expect(controller.getState()).toMatchObject({
        phase: 'ready_for_commit',
        readyForCommit: [{ fromAccountId: 11, toAccountId: 2, amountCents: 350 }],
      });
    },
  );
  it('retains immutable item assignments through review and saves the moved amounts once', () => {
    const controller = ready(true);
    controller.handleAnalysisState(
      {
        ...SUCCEEDED,
        review: {
          receiptDate: '2026-07-31',
          buyplace: 'Shop',
          currency: 'EUR',
          receiptTotalCents: 350,
          transfers: [
            {
              name: 'Food',
              amountCents: 350,
              categoryNames: ['Einkauf'],
              items: [
                { index: 0, name: 'Bread', lineTotalCents: 250 },
                { index: 1, name: 'Apple', lineTotalCents: 100 },
              ],
            },
          ],
        },
      },
      OPTIONS,
    );
    const draft = controller.getState().draft!;
    expect(Object.isFrozen(draft.transfers[0]?.items)).toBe(true);
    expect(Object.isFrozen(draft.transfers[0]?.items[0])).toBe(true);
    const moved = moveReceiptReviewItem(
      {
        ...draft,
        transfers: [
          ...draft.transfers,
          { id: 1, name: 'New food', amount: '', categoryNames: ['Einkauf'], items: [] },
        ],
      },
      0,
      0,
      1,
    )!;
    controller.updateDraft(moved);
    expect(controller.getState().readyForCommit).toBeNull();
    controller.prepareForSave(OPTIONS);
    const commands = controller.claimReadyForCommit()!;
    expect(commands.map((command) => command.amountCents)).toEqual([100, 250]);
    expect(controller.getState().draft).toBeNull();
    expect(controller.claimReadyForCommit()).toBeNull();
  });

  it('books edited shared metadata and partial amounts only on Save, with a single immutable handoff', () => {
    const controller = ready(true);
    const draft = controller.getState().draft!;
    controller.updateDraft({
      ...draft,
      date: '2026-08-01',
      buyplace: 'Rewe',
      transfers: [
        { ...draft.transfers[0]!, name: 'Edited food', amount: '2,00€' },
        { id: 1, items: [], name: 'Added food', amount: '1,50€', categoryNames: ['Einkauf'] },
      ],
    });
    controller.prepareForSave(OPTIONS);
    const commands = controller.claimReadyForCommit()!;
    expect(commands).toHaveLength(2);
    expect(commands.map((command) => command.buyplace)).toEqual(['Rewe', 'Rewe']);
    expect(new Set(commands.map((command) => command.bookingDateEpochDay)).size).toBe(1);
    expect(commands.map((command) => command.amountCents)).toEqual([200, 150]);
    expect(Object.isFrozen(commands)).toBe(true);
    expect(controller.claimReadyForCommit()).toBeNull();
    expect(controller.getState().draft).toBeNull();
  });
  it('retains partial results through a capture failure and permits correcting missing fields', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.handleAnalysisState(
      {
        ...DERIVING,
        phase: 'error',
        errorCode: 'model_error',
        review: {
          receiptDate: '2026-07-31',
          buyplace: 'Partial shop',
          receiptTotalCents: 350,
          transfers: [],
        },
      },
      OPTIONS,
    );
    controller.handleCaptureFailure();
    expect(controller.getState()).toMatchObject({
      phase: 'waiting_for_source',
      draft: { buyplace: 'Partial shop', date: '2026-07-31' },
    });
    controller.selectSourceAccount(11, OPTIONS);
    controller.prepareForSave(OPTIONS);
    expect(controller.getState()).toMatchObject({
      phase: 'reviewing',
      error: { code: 'invalid_transfer' },
    });
    const draft = controller.getState().draft!;
    controller.updateDraft({
      ...draft,
      transfers: [{ ...draft.transfers[0]!, name: 'Corrected food' }],
    });
    controller.prepareForSave(OPTIONS);
    expect(controller.getState().readyForCommit).toHaveLength(1);
  });
  it('retains edits while current options refresh and revalidates categories on Save', () => {
    const controller = ready(true);
    const draft = controller.getState().draft;
    controller.refreshOptions({ ...OPTIONS, operation: 'loading' });
    controller.refreshOptions(OPTIONS);
    expect(controller.getState().draft).toEqual(draft);
    expect(controller.getState().readyForCommit).toBeNull();
    controller.prepareForSave({ ...OPTIONS, categoryOptions: [] });
    expect(controller.getState()).toMatchObject({
      phase: 'reviewing',
      error: { code: 'category_not_found' },
    });
    expect(controller.getState().draft).toEqual(draft);
  });
  it('keeps review data on offline transitions and clears it on reset and disposal', () => {
    const controller = ready(true);
    controller.failForOffline();
    const offlineState = controller.getState();
    controller.failForOffline();
    expect(controller.getState()).toBe(offlineState);
    expect(controller.getState()).toMatchObject({ phase: 'reviewing', error: { code: 'offline' } });
    expect(controller.getState().draft).not.toBeNull();
    controller.reset();
    expect(controller.getState()).toMatchObject({
      phase: 'idle',
      draft: null,
      sourceAccountId: null,
    });
    controller.beginRun();
    controller.handleAnalysisState(SUCCEEDED, OPTIONS);
    controller.dispose();
    expect(controller.getState().draft).toBeNull();
  });
  it('does not retain data when no structured partial result exists', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.handleAnalysisState(
      { ...DERIVING, phase: 'error', errorCode: 'invalid_response' },
      OPTIONS,
    );
    expect(controller.getState()).toMatchObject({ phase: 'error', draft: null });
  });
  it('does not book known non-EUR partial data as EUR', () => {
    const controller = ready(true);
    const draft = controller.getState().draft!;
    controller.updateDraft({ ...draft, currency: 'USD' });
    controller.prepareForSave(OPTIONS);
    expect(controller.getState()).toMatchObject({
      phase: 'reviewing',
      readyForCommit: null,
      error: { code: 'invalid_transfer', detail: 'addTransfer.receipt.review.currencyUnsupported' },
    });
  });
  it('retains progress without a source selection during both model calls', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.handleAnalysisState(DERIVING, OPTIONS);
    expect(controller.getState()).toMatchObject({
      phase: 'processing',
      sourceAccountId: null,
      steps: [
        { id: 'extraction', status: 'complete' },
        { id: 'derivation', status: 'active' },
        { id: 'creation', status: 'pending' },
      ],
    });
  });
});
