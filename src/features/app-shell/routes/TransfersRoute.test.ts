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
    expect(body).toMatch(/<h2[^>]*>Transfers<\/h2>/u);
    expect(body).toContain('data-testid="transfers-sort-button"');
    expect(body).toContain('Sortierung: Älteste oben. Reihenfolge umkehren');
    expect(body).toContain('data-testid="transfers-month-navigation"');
    expect(body).toContain('data-testid="transfers-month-previous-button"');
    expect(body).toContain('data-testid="transfers-month-next-button"');
    expect(body).toContain('aria-label="Vorheriger Monat"');
    expect(body).toContain('aria-label="Nächster Monat"');
    expect(body).toContain('data-testid="transfers-month-label"');
    expect(body).toContain('data-testid="transfers-month-swipe-surface"');
    expect(body).toContain('aria-label="Wischbereich für Transfermonate"');
    expect(body).toContain('transfers-route__drag-track');
    expect(body).toContain('transform: translateX(0.0px);');
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
    expect(body).not.toContain('data-testid="transfers-route-status"');
    expect(body).not.toContain('Für diesen Monat sind keine Transfers vorhanden.');
    expect(body).toContain('Es gibt keine Transfers für diesen Monat.');
  });

  it.each([
    {
      semantic: 'positive',
      fromName: 'EINNAHMEN',
      toName: 'Checking',
      visible: ['Checking'],
      hidden: ['EINNAHMEN'],
    },
    {
      semantic: 'negative',
      fromName: 'Checking',
      toName: 'AUSGABEN',
      visible: ['Checking'],
      hidden: ['AUSGABEN'],
    },
    {
      semantic: 'neutral',
      fromName: 'Checking',
      toName: 'Wallet',
      visible: ['Checking', 'Wallet'],
      hidden: [],
    },
  ])(
    'renders only relevant accounts for $semantic transfers',
    ({ semantic, fromName, toName, visible, hidden }) => {
      const mockTransfer = {
        transferId: 99,
        bookingDateEpochDay: 20000,
        name: 'Test Transfer',
        amountCents: 5000,
        amountSemantic: semantic,
        fromAccountName: fromName,
        toAccountName: toName,
        categoryNames: [],
        buyplace: 'Local Market',
      };

      const controller = createMockController('ready', [mockTransfer]);
      const { body } = render(TransfersRoute, {
        props: { controller: controller as unknown as TransfersRouteController },
      });

      for (const name of visible) expect(body).toContain(name);
      for (const name of hidden) expect(body).not.toContain(name);
      expect(body.includes('transfer-card__account-arrow')).toBe(semantic === 'neutral');
      expect(body).toContain('(Local Market)</span>\u00a0');
      expect(body).toContain('Test Transfer');
      expect(body).not.toContain('Ort:');
    },
  );
});
