import { describe, expect, it } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';

import AppShell from './AppShell.svelte';
import type { AppRouteKey } from './hashRouting';

const ROUTE_TEST_IDS: Record<AppRouteKey, string> = {
  accounts: 'route-accounts',
  transfers: 'route-transfers',
  add: 'route-add',
  settings: 'route-settings',
};

describe('AppShell component', () => {
  it('renders loading placeholder before route placeholder content', () => {
    const { body } = render(AppShell);

    expect(body).toContain('data-testid="loading-placeholder"');
    expect(body).not.toContain('data-testid="route-accounts"');
    expect(body).not.toContain('data-testid="route-transfers"');
    expect(body).not.toContain('data-testid="route-add"');
    expect(body).not.toContain('data-testid="route-settings"');
  });

  it.each<AppRouteKey>(['accounts', 'transfers', 'add', 'settings'])(
    'renders %s route content once loading is complete',
    (route) => {
      const { body } = render(AppShell, {
        props: {
          routeStore: readable(route),
          showLoadingPlaceholder: false,
        },
      });

      expect(body).not.toContain('data-testid="loading-placeholder"');
      expect(body).toContain(`data-testid="${ROUTE_TEST_IDS[route]}"`);
      expect(body).toContain(`href="#/${route}"`);
      expect(body).toContain('aria-current="page"');
    },
  );
});
