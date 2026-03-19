// Validates TransfersRoute month-navigation rendering contracts for M5-04.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import TransfersRoute from './TransfersRoute.svelte';

describe('TransfersRoute', () => {
  it('renders month navigation controls and swipe surface placeholders', () => {
    const { body } = render(TransfersRoute);

    expect(body).toContain('data-testid="route-transfers"');
    expect(body).toContain('<h2>Transfers</h2>');
    expect(body).toContain('data-testid="transfers-month-navigation"');
    expect(body).toContain('data-testid="transfers-month-previous-button"');
    expect(body).toContain('data-testid="transfers-month-next-button"');
    expect(body).toContain('data-testid="transfers-month-label"');
    expect(body).toContain('data-testid="transfers-month-swipe-surface"');
    expect(body).toContain('Transfer list rendering ships in M5-06.');
  });

  it('exposes a deterministic YYYY-MM month key marker', () => {
    const { body } = render(TransfersRoute);
    const monthKeyMatch = body.match(/data-month-key="(\d{4}-\d{2})"/u);

    expect(monthKeyMatch).not.toBeNull();
  });
});
