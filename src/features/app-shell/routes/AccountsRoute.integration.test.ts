/**
 * Integration tests for the Accounts Route.
 * Verifies that the route correctly renders account data from the real SQLite fixture.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import { createBrowserDbRuntime, createAccountQueryService } from '@db';
import AccountsRoute from './AccountsRoute.svelte';
import { createAccountsRouteController } from './accountsRouteController';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../../../shared/testUtils/dbIntegration';

describe('AccountsRoute Integration', () => {
  it('renders account cards dynamically from fixture DB', async () => {
    const loader = createNodeSqlJsRuntimeLoader();
    const runtime = createBrowserDbRuntime(loader);
    await runtime.open(loadTransferFixtureBytes());

    const accountQueryService = createAccountQueryService(runtime);
    const controller = createAccountsRouteController(accountQueryService);

    await controller.load();

    const { body } = render(AccountsRoute, {
      props: {
        controller,
      },
    });

    expect(body).toContain('data-testid="account-card-3"');
    expect(body).toContain('Girokonto');

    runtime.close();
  });
});
