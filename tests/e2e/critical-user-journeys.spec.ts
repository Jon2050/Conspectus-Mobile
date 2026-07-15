// Verifies the cohesive user journeys that form the Playwright release gate.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  appPath,
  getCacheReadSnapshotCallCount,
  getGraphDownloadCallCount,
  getGraphMetadataCallCount,
  getGraphUploadCallCount,
  getLocalTransferWriteCallCount,
  installMockAuthClient,
  installMockCacheStore,
  installMockGraphClient,
  installMockStartupNetworkState,
  installPersistedBinding,
  installReadyAddTransferTestDb,
} from './support/app-test-harness';

test.use({ viewport: { width: 390, height: 844 } });

const fixtureBytes = Array.from(
  fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/test.db')),
);

const installWritableJourneyState = async (
  page: Page,
  uploadErrorSequence: readonly { readonly code: string; readonly message: string }[] = [],
): Promise<void> => {
  await installReadyAddTransferTestDb(
    page,
    {
      forceAlwaysOpen: true,
      fromAccountOptionRows: [
        { accountId: 3, name: 'Girokonto', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 4, name: 'Kreditkarte', amountCents: 0, accountTypeId: 3 },
      ],
      accountRows: [
        { accountId: 3, name: 'Girokonto', amountCents: 1000, accountTypeId: 3 },
        { accountId: 4, name: 'Kreditkarte', amountCents: 0, accountTypeId: 3 },
      ],
      categoryRows: [{ categoryId: 1, name: 'Lebensmittel' }],
    },
    { uploadErrorSequence },
  );
  await page.clock.setFixedTime(new Date('2026-07-16T12:00:00.000Z'));
};

const fillValidTransfer = async (page: Page, name: string, amountDigits: string): Promise<void> => {
  await page.getByTestId('add-transfer-name').fill(name);
  await page.getByTestId('add-transfer-amount').pressSequentially(amountDigits);
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });
  await page.getByTestId('add-transfer-category-1').selectOption({ label: 'Lebensmittel' });
};

test('critical journey: signs in, binds a OneDrive DB, and reads accounts and transfers', async ({
  page,
}) => {
  await installMockAuthClient(page);
  await installMockGraphClient(page, {
    downloadBytes: fixtureBytes,
    metadataETag: '"journey-etag"',
  });
  await installMockCacheStore(page);
  await installMockStartupNetworkState(page, true);
  await page.clock.setFixedTime(new Date('2024-04-15T12:00:00.000Z'));

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
  await expect(page.getByText('mock-user@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('open-folder-folder-finance').click();
  await page.getByTestId('select-file-file-finance-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/Finance');
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect.poll(() => getGraphMetadataCallCount(page)).toBe(1);
  await expect.poll(() => getGraphDownloadCallCount(page)).toBe(1);

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByTestId('account-card-3')).toContainText('Girokonto');
  await expect(page.getByTestId('account-amount-positive-3')).toHaveAttribute(
    'data-amount-cents',
    '55000',
  );
  await expect(page.getByTestId('account-card-7')).toHaveCount(0);

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    '2024-04',
  );
  await expect(page.getByTestId('transfer-card-2')).toContainText('Groceries');
  await expect(page.getByTestId('transfer-card-3')).toContainText('Wallet top-up');
  await expect(page.getByTestId('transfer-card-1')).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');
});

test('critical journey: adds a transfer and observes updated transfers and balances', async ({
  page,
}) => {
  await installWritableJourneyState(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
  await fillValidTransfer(page, 'Release Gate Transfer', '1550');

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-submit')).toBeDisabled();
  await expect(page.getByTestId('add-transfer-upload-status')).toBeVisible();
  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  expect(await getGraphUploadCallCount(page)).toBe(1);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);

  await page.getByTestId('add-transfer-close').click();
  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page.getByTestId('transfer-card-999')).toContainText('Release Gate Transfer');

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="3"]'),
  ).toHaveAttribute('data-amount-cents', '-550');
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="4"]'),
  ).toHaveAttribute('data-amount-cents', '1550');
});

test('critical journey: retries a failed upload without repeating the local write', async ({
  page,
}) => {
  await installWritableJourneyState(page, [
    { code: 'network_error', message: 'Mock transient upload failure.' },
  ]);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
  await fillValidTransfer(page, 'Retry Journey Transfer', '1000');

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-form-error')).toBeVisible();
  expect(await getGraphUploadCallCount(page)).toBe(1);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);

  await page.getByTestId('add-transfer-close').click();
  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page.getByTestId('pending-transfer-sync')).toBeVisible();
  await page.getByTestId('pending-transfer-retry').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  await expect(page.getByTestId('pending-transfer-sync')).toHaveCount(0);
  expect(await getGraphUploadCallCount(page)).toBe(2);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
});

test('critical journey: offline startup fails closed without cached account or transfer reads', async ({
  page,
}) => {
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: { eTag: '"offline-etag"' },
      dbBytes: fixtureBytes,
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  expect(await getCacheReadSnapshotCallCount(page)).toBe(0);
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page.getByTestId('transfers-route-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(page.getByTestId('transfers-route-cards')).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();
});
