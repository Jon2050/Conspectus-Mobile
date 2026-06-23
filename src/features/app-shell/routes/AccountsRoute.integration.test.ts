import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import { createBrowserDbRuntime, createSqlJsLoader, createAccountQueryService } from '@db';
import AccountsRoute from './AccountsRoute.svelte';
import { createAccountsRouteController } from './accountsRouteController';

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
