// Verifies account-independent analysis progress, automatic handoff, and complete transient cleanup.
import { describe, expect, it } from 'vitest';
import { PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID } from '@db';

import type { AddTransferOptionsState } from '../app-shell/routes/addTransferOptionsController';
import type { ReceiptAnalysisState } from './receiptAnalysisController';
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
  it('starts with no source and lets analysis reach stage two independently', () => {
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

  it('waits after analysis and hands off automatically when the source is selected', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.handleAnalysisState(SUCCEEDED, OPTIONS);

    expect(controller.getState()).toMatchObject({
      phase: 'waiting_for_source',
      sourceAccountId: null,
      readyForCommit: null,
    });

    controller.selectSourceAccount(11, OPTIONS);

    const state = controller.getState();
    expect(state).toMatchObject({
      phase: 'ready_for_commit',
      sourceAccountId: 11,
      steps: [
        { id: 'extraction', status: 'complete' },
        { id: 'derivation', status: 'complete' },
        { id: 'creation', status: 'active' },
      ],
    });
    expect(state.readyForCommit).toHaveLength(1);
    expect(state.readyForCommit?.[0]).toMatchObject({ fromAccountId: 11, toAccountId: 2 });
  });

  it('prepares the same batch when the source is selected before analysis completes', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.selectSourceAccount(11, OPTIONS);
    controller.handleAnalysisState(DERIVING, OPTIONS);
    controller.handleAnalysisState(SUCCEEDED, OPTIONS);

    expect(controller.getState()).toMatchObject({
      phase: 'ready_for_commit',
      sourceAccountId: 11,
      readyForCommit: [{ fromAccountId: 11, amountCents: 350 }],
    });
  });

  it('fails closed on local category resolution and clears all run data', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.selectSourceAccount(11, OPTIONS);
    controller.handleAnalysisState(SUCCEEDED, { ...OPTIONS, categoryOptions: [] });

    expect(controller.getState()).toEqual({
      phase: 'error',
      steps: [
        { id: 'extraction', status: 'complete' },
        { id: 'derivation', status: 'complete' },
        { id: 'creation', status: 'error' },
      ],
      sourceAccountId: null,
      readyForCommit: null,
      error: { code: 'category_not_found', detail: 'Einkauf' },
    });
  });

  it.each([
    {
      name: 'no valid source account',
      options: { ...OPTIONS, fromAccountOptions: [] },
      code: 'source_account_unavailable',
    },
    {
      name: 'a missing primary spendings account',
      options: { ...OPTIONS, toAccountOptions: [] },
      code: 'primary_spendings_unavailable',
    },
    {
      name: 'ambiguous primary spendings accounts',
      options: {
        ...OPTIONS,
        toAccountOptions: [
          ...OPTIONS.toAccountOptions,
          {
            accountId: 3,
            name: 'Duplicate Primary Spendings',
            accountTypeId: PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
          },
        ],
      },
      code: 'primary_spendings_unavailable',
    },
  ])('fails closed after analysis when account topology has $name', ({ options, code }) => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();

    controller.handleAnalysisState(SUCCEEDED, options);

    expect(controller.getState()).toEqual({
      phase: 'error',
      steps: [
        { id: 'extraction', status: 'complete' },
        { id: 'derivation', status: 'complete' },
        { id: 'creation', status: 'error' },
      ],
      sourceAccountId: null,
      readyForCommit: null,
      error: { code, detail: null },
    });
  });

  it('fails the active remote step when connectivity is lost and clears the selection', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.selectSourceAccount(11, OPTIONS);
    controller.handleAnalysisState(DERIVING, OPTIONS);

    controller.failForOffline();

    expect(controller.getState()).toEqual({
      phase: 'error',
      steps: [
        { id: 'extraction', status: 'complete' },
        { id: 'derivation', status: 'error' },
        { id: 'creation', status: 'pending' },
      ],
      sourceAccountId: null,
      readyForCommit: null,
      error: { code: 'offline', detail: null },
    });
  });

  it('clears selection, proof, commands, and progress on cancellation or a fresh run', () => {
    const controller = createReceiptTransferPreparationController();
    controller.beginRun();
    controller.selectSourceAccount(11, OPTIONS);
    controller.handleAnalysisState(SUCCEEDED, OPTIONS);
    expect(controller.getState().phase).toBe('ready_for_commit');

    controller.reset();
    expect(controller.getState()).toMatchObject({
      phase: 'idle',
      sourceAccountId: null,
      readyForCommit: null,
    });

    controller.beginRun();
    expect(controller.getState()).toMatchObject({
      phase: 'processing',
      sourceAccountId: null,
      readyForCommit: null,
    });
  });
});
