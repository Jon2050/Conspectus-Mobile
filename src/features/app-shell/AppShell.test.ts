// Verifies shared app-shell route rendering and deployment-footer presence across routes.
import { describe, expect, it } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';
import { createSyncStateStore, formatBuildInfoLabel, getFallbackBuildInfo } from '@shared';

import AppShell from './AppShell.svelte';
import { APP_ROUTES, type AppRouteKey } from './hashRouting';
import type {
  AddTransferSaveController,
  AddTransferSaveState,
} from './routes/addTransferSaveController';

const ROUTE_TEST_IDS: Record<AppRouteKey, string> = {
  accounts: 'route-accounts',
  transfers: 'route-transfers',
  add: 'route-add',
  settings: 'route-settings',
};
const NAV_ICON_BASE_URL = '/';

const UPLOAD_FAILED_SAVE_STATE: AddTransferSaveState = {
  phase: 'upload_failed',
  errorMessage: 'Upload failed.',
  progress: null,
  recoveryProgress: null,
  canRetry: true,
};

const createMockSaveController = (state: AddTransferSaveState): AddTransferSaveController => ({
  getState: () => state,
  subscribe: (listener) => {
    listener(state);
    return () => {};
  },
  submit: async () => ({ validationErrors: [] }),
  retry: async () => {},
  resolveConflict: async () => {},
  reset: () => {},
});

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
      expect(body).toContain('aria-label="Hauptnavigation"');
      expect(body).toContain('data-testid="deployment-info-label"');
      expect(body).toContain(formatBuildInfoLabel(getFallbackBuildInfo()));
      expect(body).toContain(`href="#/${route}"`);
      expect(body).toContain('aria-current="page"');
      expect(body).toContain(`src="${NAV_ICON_BASE_URL}${routeMeta.icon}"`);
      expect(body).toContain(`data-testid="app-nav-icon-${route}"`);
      const ROUTE_LABELS: Record<AppRouteKey, string> = {
        accounts: 'Konten',
        transfers: 'Transfers',
        add: 'Neu',
        settings: 'Einstellungen',
      };
      expect(body).toContain(ROUTE_LABELS[route]);
    },
  );

  it('keeps a failed transfer sync actionable outside the Add Transfer sheet', () => {
    const { body } = render(AppShell, {
      props: {
        routeStore: readable<AppRouteKey>('transfers'),
        showLoadingPlaceholder: false,
        addTransferSaveController: createMockSaveController(UPLOAD_FAILED_SAVE_STATE),
      },
    });

    expect(body).toContain('data-testid="pending-transfer-sync"');
    expect(body).toContain('data-testid="pending-transfer-review"');
    expect(body).toContain('data-testid="pending-transfer-retry"');
    expect(body).toContain('Transfersynchronisierung benötigt Aufmerksamkeit');
  });

  it('renders indeterminate progress throughout the startup metadata check', () => {
    const syncStateStore = createSyncStateStore({
      state: 'syncing',
      message: 'Checking OneDrive database freshness...',
    });
    const { body } = render(AppShell, {
      props: {
        routeStore: readable<AppRouteKey>('settings'),
        showLoadingPlaceholder: false,
        syncStateStore,
      },
    });

    expect(body).toContain('data-testid="startup-sync-progress"');
    expect(body).toContain('data-testid="progress-bar"');
    expect(body).toContain('Checking OneDrive database freshness...');
    expect(body).not.toMatch(/<progress[^>]*\svalue=/u);
  });

  it('renders the stale-token recovery action only for an expired auth session', () => {
    const syncStateStore = createSyncStateStore({
      state: 'error',
      branch: 'online_auth_expired',
      message: 'Your session has expired. Please sign in again to sync with OneDrive.',
    });
    const { body } = render(AppShell, {
      props: {
        routeStore: readable<AppRouteKey>('transfers'),
        showLoadingPlaceholder: false,
        syncStateStore,
      },
    });

    expect(body).toContain('data-testid="stale-token-recovery"');
    expect(body).toContain('data-testid="stale-token-recovery-button"');
    expect(body).toContain('Microsoft-Sitzung abgelaufen');
    expect(body).toContain('Erneut anmelden');
  });

  it('does not offer re-authentication for unrelated sync errors', () => {
    const syncStateStore = createSyncStateStore({
      state: 'error',
      branch: 'online_metadata_failed',
      message: 'OneDrive metadata is unavailable.',
    });
    const { body } = render(AppShell, {
      props: {
        routeStore: readable<AppRouteKey>('accounts'),
        showLoadingPlaceholder: false,
        syncStateStore,
      },
    });

    expect(body).not.toContain('data-testid="stale-token-recovery"');
    expect(body).not.toContain('data-testid="stale-token-recovery-button"');
  });

  it('offers the rebind path only for a definitively missing saved file', () => {
    const syncStateStore = createSyncStateStore({
      state: 'error',
      branch: 'online_file_missing',
      message: 'The selected file is missing.',
    });
    const { body } = render(AppShell, {
      props: {
        routeStore: readable<AppRouteKey>('accounts'),
        showLoadingPlaceholder: false,
        syncStateStore,
      },
    });

    expect(body).toContain('data-testid="missing-file-recovery"');
    expect(body).toContain('data-testid="missing-file-recovery-button"');
    expect(body).toContain('OneDrive-Datenbank nicht gefunden');
    expect(body).toContain('Andere Datenbank auswählen');
    expect(body).not.toContain('data-testid="stale-token-recovery"');
  });
});
