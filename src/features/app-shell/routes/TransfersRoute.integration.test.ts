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
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('renders transfer cards dynamically from fixture DB for March 2024', async () => {
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

    await controller.load(toEpochDay(2024, 3, 15));

    const { body } = render(TransfersRoute, {
      props: {
        controller,
      },
    });

    expect(body).toContain('data-testid="transfer-card-1"');
    expect(body).toContain('Salary'); // from fixture

    runtime.close();
  });
});
