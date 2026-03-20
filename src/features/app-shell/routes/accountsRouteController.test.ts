// Verifies account-route load state transitions and view-model mapping.
import { describe, expect, it, vi } from 'vitest';

import { createAccountsRouteController, type AccountsRouteState } from './accountsRouteController';

const getStateSnapshot = (state: AccountsRouteState): AccountsRouteState => ({
  operation: state.operation,
  accounts: state.accounts.map((account) => ({
    accountId: account.accountId,
    name: account.name,
    amountCents: account.amountCents,
    amountDisplay: account.amountDisplay,
    amountSemantic: account.amountSemantic,
  })),
  error:
    state.error === null
      ? null
      : {
          message: state.error.message,
          cause: state.error.cause,
        },
});

describe('accounts route controller', () => {
  it('loads account rows into ready cards with amount semantics and formatting', async () => {
    const listVisibleNonPrimaryAccounts = vi.fn(() => [
      { accountId: 12, name: 'Cash', amountCents: 1250 },
      { accountId: 18, name: 'Loan', amountCents: -9750 },
      { accountId: 19, name: 'Offset', amountCents: 0 },
    ]);
    const controller = createAccountsRouteController({ listVisibleNonPrimaryAccounts });

    expect(controller.getState()).toEqual({
      operation: 'loading',
      accounts: [],
      error: null,
    });

    await controller.load();

    expect(listVisibleNonPrimaryAccounts).toHaveBeenCalledTimes(1);
    expect(getStateSnapshot(controller.getState())).toEqual({
      operation: 'ready',
      accounts: [
        {
          accountId: 12,
          name: 'Cash',
          amountCents: 1250,
          amountDisplay: '+$12.50',
          amountSemantic: 'positive',
        },
        {
          accountId: 18,
          name: 'Loan',
          amountCents: -9750,
          amountDisplay: '-$97.50',
          amountSemantic: 'negative',
        },
        {
          accountId: 19,
          name: 'Offset',
          amountCents: 0,
          amountDisplay: '$0.00',
          amountSemantic: 'neutral',
        },
      ],
      error: null,
    });
  });

  it('moves to an empty state when the query returns no accounts', async () => {
    const listVisibleNonPrimaryAccounts = vi.fn(() => []);
    const controller = createAccountsRouteController({ listVisibleNonPrimaryAccounts });

    await controller.load();

    expect(controller.getState()).toEqual({
      operation: 'empty',
      accounts: [],
      error: null,
    });
  });

  it('captures query failures as an error state', async () => {
    const queryError = new Error('Mock account query failure.');
    const listVisibleNonPrimaryAccounts = vi.fn(() => {
      throw queryError;
    });
    const controller = createAccountsRouteController({ listVisibleNonPrimaryAccounts });

    await controller.load();

    expect(controller.getState()).toEqual({
      operation: 'error',
      accounts: [],
      error: {
        message: 'Mock account query failure.',
        cause: queryError,
      },
    });
  });

  it('treats a db_not_open query failure as an actionable empty state', async () => {
    const listVisibleNonPrimaryAccounts = vi.fn(() => {
      throw {
        code: 'db_not_open',
        message: 'SQLite runtime is not open.',
      };
    });
    const controller = createAccountsRouteController({ listVisibleNonPrimaryAccounts });

    await controller.load();

    expect(controller.getState()).toEqual({
      operation: 'empty',
      accounts: [],
      error: null,
    });
  });
});
