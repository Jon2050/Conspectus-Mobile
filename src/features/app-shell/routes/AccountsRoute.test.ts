// Verifies the AccountsRoute renders loading, empty, error, and ready states with stable hooks.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

import AccountsRoute from './AccountsRoute.svelte';
import type { AccountsRouteController, AccountsRouteState } from './accountsRouteController';

const createMockController = (state: AccountsRouteState): AccountsRouteController => ({
  getState: () => state,
  subscribe: (listener) => {
    listener(state);
    return () => {};
  },
  load: vi.fn(async () => {}),
});

describe('AccountsRoute', () => {
  it('renders loading state with skeleton cards', () => {
    const { body } = render(AccountsRoute, {
      props: {
        controller: createMockController({
          operation: 'loading',
          accounts: [],
          error: null,
        }),
      },
    });

    expect(body).toContain('data-testid="route-accounts"');
    expect(body).toContain('<h2>Accounts</h2>');
    expect(body).toContain('data-testid="accounts-route-status"');
    expect(body).toContain('Loading accounts from the local database...');
    expect(body).toContain('data-testid="accounts-route-loading"');
  });

  it('renders an empty state when no accounts are returned', () => {
    const { body } = render(AccountsRoute, {
      props: {
        controller: createMockController({
          operation: 'empty',
          accounts: [],
          error: null,
        }),
      },
    });

    expect(body).toContain('No visible non-primary accounts found or no DB file is ready.');
    expect(body).toContain('data-testid="accounts-route-empty"');
    expect(body).toContain('open Settings and bind your OneDrive database');
  });

  it('renders an error state with alert semantics', () => {
    const { body } = render(AccountsRoute, {
      props: {
        controller: createMockController({
          operation: 'error',
          accounts: [],
          error: {
            message: 'Mock account query failure.',
            cause: new Error('Mock account query failure.'),
          },
        }),
      },
    });

    expect(body).toContain('role="alert"');
    expect(body).toContain('Mock account query failure.');
  });

  it('renders ready account cards with semantic amount hooks', () => {
    const { body } = render(AccountsRoute, {
      props: {
        controller: createMockController({
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
        }),
      },
    });

    expect(body).toContain('data-testid="accounts-route-cards"');
    expect(body).toContain('data-testid="account-card-12"');
    expect(body).toContain('data-testid="account-amount-positive-12"');
    expect(body).toContain('data-amount-semantic="positive"');
    expect(body).toContain('+$12.50');
    expect(body).toContain('data-testid="account-amount-negative-18"');
    expect(body).toContain('data-amount-semantic="negative"');
    expect(body).toContain('-$97.50');
    expect(body).toContain('data-testid="account-amount-neutral-19"');
    expect(body).toContain('data-amount-semantic="neutral"');
    expect(body).toContain('$0.00');
  });
});
