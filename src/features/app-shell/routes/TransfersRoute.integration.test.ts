/**
 * Integration tests for the Transfers Route.
 * Verifies that the route correctly fetches and renders transfer data for a given month from the real SQLite fixture.
 */
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { render } from 'svelte/server';

import {
  createBrowserDbRuntime,
  createTransferMonthQueryService,
  createAccountQueryService,
  createCategoryQueryService,
} from '@db';
import TransfersRoute from './TransfersRoute.svelte';
import { createTransfersRouteController } from './transfersRouteController';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../../../shared/testUtils/dbIntegration';
import { toEpochDay } from '../../../shared/testUtils/dateUtils';

describe('TransfersRoute Integration', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-15T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('renders transfer cards and category badges dynamically from fixture DB', async () => {
    const loader = createNodeSqlJsRuntimeLoader();
    const runtime = createBrowserDbRuntime(loader);
    await runtime.open(loadTransferFixtureBytes());

    const transferQueryService = createTransferMonthQueryService(runtime);
    const accountQueryService = createAccountQueryService(runtime);
    const categoryQueryService = createCategoryQueryService(runtime);

    const controller = createTransfersRouteController(
      transferQueryService,
      accountQueryService,
      categoryQueryService,
    );

    await controller.load(toEpochDay(2024, 4, 15));

    const { body } = render(TransfersRoute, {
      props: {
        controller,
      },
    });

    expect(body).toContain('data-testid="transfer-card-2"');
    expect(body).toContain('Groceries'); // transfer name and category badge from fixture
    expect(body).toMatch(/<span class="app-badge svelte-[^"]+">Groceries<\/span>/u);

    runtime.close();
  });
});
