// Validates TransfersRoute month-navigation and list rendering contracts for M5-06.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import type { TransfersRouteController } from './transfersRouteController';

import TransfersRoute from './TransfersRoute.svelte';

describe('TransfersRoute', () => {
  const createMockController = (
    operation: 'loading' | 'ready' | 'empty' | 'error' = 'ready',
    transfers: readonly unknown[] = [],
  ) => ({
    getState: vi.fn(() => ({
      operation,
      transfers,
      error: null,
    })),
    subscribe: vi.fn(() => () => {}),
    load: vi.fn().mockResolvedValue(undefined),
  });

  it('renders month navigation controls and swipe surface', () => {
    const controller = createMockController('ready');
    const { body } = render(TransfersRoute, {
      props: { controller: controller as unknown as TransfersRouteController },
    });

    expect(body).toContain('data-testid="route-transfers"');
    expect(body).toContain('<h2>Transfers</h2>');
    expect(body).toContain('data-testid="transfers-month-navigation"');
    expect(body).toContain('data-testid="transfers-month-previous-button"');
    expect(body).toContain('data-testid="transfers-month-next-button"');
    expect(body).toContain('data-testid="transfers-month-label"');
    expect(body).toContain('data-testid="transfers-month-swipe-surface"');
  });

  it('exposes a deterministic YYYY-MM month key marker', () => {
    const controller = createMockController('ready');
    const { body } = render(TransfersRoute, {
      props: { controller: controller as unknown as TransfersRouteController },
    });
    const monthKeyMatch = body.match(/data-month-key="(\d{4}-\d{2})"/u);

    expect(monthKeyMatch).not.toBeNull();
  });

  it('shows loading skeletons when controller is in loading state', () => {
    const controller = createMockController('loading');
    const { body } = render(TransfersRoute, {
      props: { controller: controller as unknown as TransfersRouteController },
    });

    expect(body).toContain('data-testid="transfers-route-loading"');
  });

  it('shows empty state when no transfers exist for the month', () => {
    const controller = createMockController('empty');
    const { body } = render(TransfersRoute, {
      props: { controller: controller as unknown as TransfersRouteController },
    });

    expect(body).toContain('data-testid="transfers-route-empty"');
    expect(body).toContain('Es gibt keine Transfers für diesen Monat.');
  });

  it('renders primary system accounts with localized display names (EINNAHMEN / AUSGABEN)', () => {
    const mockTransfer = {
      transferId: 99,
      bookingDateEpochDay: 20000,
      name: 'Test Transfer',
      amountCents: 5000,
      amountSemantic: 'neutral',
      fromAccountName: 'Original From Name',
      toAccountName: 'Original To Name',
      categoryNames: [],
      buyplace: null,
      fromAccountTypeId: 2, // PRIMARY_SPENDINGS -> AUSGABEN
      toAccountTypeId: 1, // PRIMARY_INCOME -> EINNAHMEN
    };

    const controller = createMockController('ready', [mockTransfer]);
    const { body } = render(TransfersRoute, {
      props: { controller: controller as unknown as TransfersRouteController },
    });

    expect(body).toContain('AUSGABEN');
    expect(body).toContain('EINNAHMEN');
    expect(body).not.toContain('Original From Name');
    expect(body).not.toContain('Original To Name');
  });
});
