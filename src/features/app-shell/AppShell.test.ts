// Verifies shared app-shell route rendering and deployment-footer presence across routes.
import { describe, expect, it } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';
import { formatBuildInfoLabel, getFallbackBuildInfo } from '@shared';

import AppShell from './AppShell.svelte';
import { APP_ROUTES, type AppRouteKey } from './hashRouting';

const ROUTE_TEST_IDS: Record<AppRouteKey, string> = {
  accounts: 'route-accounts',
  transfers: 'route-transfers',
  add: 'route-add',
  settings: 'route-settings',
};
const NAV_ICON_BASE_URL = '/';

describe('AppShell component', () => {
  it('renders loading placeholder before route placeholder content', () => {
    const { body } = render(AppShell);

    expect(body).toContain('data-testid="loading-placeholder"');
    expect(body).not.toContain('data-testid="deployment-info-footer"');
    expect(body).not.toContain('data-testid="route-accounts"');
    expect(body).not.toContain('data-testid="route-transfers"');
    expect(body).not.toContain('data-testid="route-add"');
    expect(body).not.toContain('data-testid="route-settings"');
  });

  it.each<AppRouteKey>(['accounts', 'transfers', 'add', 'settings'])(
    'renders %s route content with the shared deployment footer once loading is complete',
    (route) => {
      const routeMeta = APP_ROUTES.find((candidate) => candidate.key === route);
      if (routeMeta === undefined) {
        throw new Error(`Missing route metadata for ${route}`);
      }

      const { body } = render(AppShell, {
        props: {
          routeStore: readable(route),
          showLoadingPlaceholder: false,
        },
      });

      expect(body).not.toContain('data-testid="loading-placeholder"');
      expect(body).toContain(`data-testid="${ROUTE_TEST_IDS[route]}"`);
      expect(body).toContain('data-testid="deployment-info-footer"');
      expect(body).toContain('data-testid="deployment-info-label"');
      expect(body).toContain(formatBuildInfoLabel(getFallbackBuildInfo()));
      expect(body).toContain(`href="#/${route}"`);
      expect(body).toContain('aria-current="page"');
      expect(body).toContain(`src="${NAV_ICON_BASE_URL}${routeMeta.icon}"`);
      expect(body).toContain(`data-testid="app-nav-icon-${route}"`);
      expect(body).toContain(routeMeta.label);
    },
  );
});
