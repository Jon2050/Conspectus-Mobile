// Validates TransfersRoute month-navigation and list rendering contracts for M5-06.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

import TransfersRoute from './TransfersRoute.svelte';

describe('TransfersRoute', () => {
  const createMockController = (
    operation: 'loading' | 'ready' | 'empty' | 'error' = 'ready',
    transfers = [],
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
    const { body } = render(TransfersRoute, { props: { controller: controller as any } });

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
    const { body } = render(TransfersRoute, { props: { controller: controller as any } });
    const monthKeyMatch = body.match(/data-month-key="(\d{4}-\d{2})"/u);

    expect(monthKeyMatch).not.toBeNull();
  });

  it('shows loading skeletons when controller is in loading state', () => {
    const controller = createMockController('loading');
    const { body } = render(TransfersRoute, { props: { controller: controller as any } });

    expect(body).toContain('data-testid="transfers-route-loading"');
  });

  it('shows empty state when no transfers exist for the month', () => {
    const controller = createMockController('empty');
    const { body } = render(TransfersRoute, { props: { controller: controller as any } });

    expect(body).toContain('data-testid="transfers-route-empty"');
    expect(body).toContain('No transfers found');
  });
});
