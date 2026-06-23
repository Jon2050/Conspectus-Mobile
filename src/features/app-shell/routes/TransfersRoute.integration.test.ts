import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { render } from 'svelte/server';

import {
  createBrowserDbRuntime,
  createSqlJsLoader,
  createTransferMonthQueryService,
  createAccountQueryService,
  createCategoryQueryService,
} from '@db';
import TransfersRoute from './TransfersRoute.svelte';
import { createTransfersRouteController } from './transfersRouteController';

const resolveNodeWasmPath = (): string =>
  path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

const resolveTransferFixturePath = (): string =>
  path.resolve(process.cwd(), 'tests/fixtures/test.db');

const createNodeSqlJsRuntimeLoader = () =>
  createSqlJsLoader({
    resolveWasmAssetUrl: resolveNodeWasmPath,
  });

const loadTransferFixtureBytes = (): Uint8Array =>
  Uint8Array.from(fs.readFileSync(resolveTransferFixturePath()));

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const toEpochDay = (year: number, month: number, day: number): number =>
  Math.floor(Date.UTC(year, month - 1, day) / MILLIS_PER_DAY);

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
