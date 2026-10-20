import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import {
  appPath,
  installMockAuthClient,
  installMockGraphClient,
  installMockCacheStore,
  installMockDbRuntime,
  installMockStartupNetworkState,
  installPersistedBinding,
  getDbRuntimeOpenCallCount,
  getCacheReadSnapshotCallCount,
  getGraphMetadataCallCount,
} from './support/app-test-harness';

test('slow auth keeps the bootstrap placeholder until the database decision', async ({ page }) => {
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installMockDbRuntime(page, {
    accountRows: [{ accountId: 3, name: 'Bank', amountCents: 1000, accountTypeId: 3 }],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __CONSPECTUS_AUTH_CLIENT__: { initialize: () => Promise<void> };
      releaseAuth?: () => void;
    };
    const initialize = state.__CONSPECTUS_AUTH_CLIENT__.initialize;
    state.__CONSPECTUS_AUTH_CLIENT__.initialize = async () => {
      await new Promise<void>((resolve) => {
        state.releaseAuth = resolve;
      });
      await initialize();
    };
  });
  await page.goto(appPath('#/accounts'));
  await page.waitForFunction(() => 'releaseAuth' in window);
  await expect(page.getByTestId('loading-placeholder')).toBeVisible();
  await expect(page.getByTestId('route-accounts')).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { releaseAuth: () => void }).releaseAuth());
  await expect(page.getByText('Bank')).toBeVisible();
});

test('unchanged foreground checks keep the runtime, draft and cache bytes untouched', async ({
  page,
}) => {
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    fromAccountOptionRows: [{ accountId: 3, name: 'Bank', amountCents: 1000, accountTypeId: 3 }],
    toAccountOptionRows: [{ accountId: 4, name: 'Card', amountCents: 0, accountTypeId: 3 }],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await page.goto(appPath('#/add'));
  await page.getByTestId('add-transfer-name').fill('Keep my draft');
  await expect(page.locator('.toast')).toHaveCount(0);
  const opens = await getDbRuntimeOpenCallCount(page);
  const reads = await getCacheReadSnapshotCallCount(page);
  const metadata = await getGraphMetadataCallCount(page);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => getGraphMetadataCallCount(page)).toBe(metadata + 1);
  await expect(page.getByTestId('startup-sync-progress')).toHaveCount(0);
  expect(await getDbRuntimeOpenCallCount(page)).toBe(opens);
  expect(await getCacheReadSnapshotCallCount(page)).toBe(reads);
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Keep my draft');
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('cache write failure has targeted retry and preserves the selected binding', async ({
  page,
}) => {
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page);
  await installMockCacheStore(page, { writeSnapshotErrorSequence: [true, false] });
  await installMockDbRuntime(page, {
    accountRows: [{ accountId: 3, name: 'Recovered bank', amountCents: 0, accountTypeId: 3 }],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await page.goto(appPath('#/accounts'));
  await expect(page.getByTestId('database-recovery')).toContainText(
    'The local database cache is unavailable.',
  );
  await expect(page.getByText('Recovered bank')).toHaveCount(0);
  await page.getByRole('button', { name: 'Load from OneDrive again' }).click();
  await expect(page.getByText('Recovered bank')).toBeVisible();
});

test('validates a large real SQLite in a worker before adopting it', async ({ page }) => {
  const sql = await initSqlJs({
    locateFile: (file) => path.resolve('node_modules/sql.js/dist', file),
  });
  const db = new sql.Database();
  db.exec(fs.readFileSync('docs/reference/conspectus-live-schema.sql', 'utf8'));
  db.exec(`INSERT INTO account_type VALUES (1, 'Income'), (2, 'Spendings'), (3, 'Standard');
    INSERT INTO account (account_id, name, ac_type_id) VALUES (1, 'Income', 1), (2, 'Spendings', 2), (3, 'Worker bank', 3);
    INSERT INTO transfer_type VALUES (1, 'Expense'), (2, 'Income'), (3, 'Internal');
    CREATE TABLE padding(value BLOB); INSERT INTO padding VALUES (zeroblob(1100000));`);
  const bytes = Array.from(db.export());
  db.close();
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, { downloadBytes: bytes });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await page.addInitScript(() => {
    delete (window as typeof window & { __CONSPECTUS_APP_SNAPSHOT_VALIDATOR__?: unknown })
      .__CONSPECTUS_APP_SNAPSHOT_VALIDATOR__;
  });
  let workers = 0;
  page.on('worker', () => {
    workers++;
  });
  await page.goto(appPath('#/accounts'));
  await expect(page.getByText('Worker bank')).toBeVisible();
  expect(workers).toBe(1);
  const phases = await page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .filter((entry) => entry.name.startsWith('conspectus:'))
      .map(({ name, duration }) => ({ name, duration })),
  );
  expect(phases.map((phase) => phase.name)).toContain('conspectus:validate');
  fs.mkdirSync('output/ap3', { recursive: true });
  fs.writeFileSync(
    `output/ap3/browser-phases-${test.info().project.name}.json`,
    JSON.stringify(phases, null, 2),
  );
});
