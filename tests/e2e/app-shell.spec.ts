// Covers the app-shell navigation, auth mock flow, and OneDrive file selection behavior in a browser.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  APP_BASE_PATH,
  RUNTIME_CLIENT_ID_PATTERN,
  appPath,
  createSqliteBytes,
  createMockGraphError,
  REQUIRED_MANIFEST_ICONS,
  resolveCurrentMonthKey,
  dispatchTransferMonthSwipe,
  inspectTransferMonthSwipeMove,
  type MockGraphClientOptions,
  type MockDbRuntimeOptions,
  installMockAuthClient,
  installMockGraphClient,
  installMockCacheStore,
  installMockDbRuntime,
  installPersistedBinding,
  installReadyAddTransferTestDb,
  installMockStartupNetworkState,
  getGraphListChildrenCallCount,
  getGraphMetadataCallCount,
  getGraphResolvePathCallCount,
  getGraphDownloadCallCount,
  getGraphUploadCallCount,
  getLocalTransferWriteCallCount,
  getCacheClearAllCallCount,
  getCacheReadSnapshotCallCount,
  getDbRuntimeOpenCallCount,
  getDbRuntimeCloseCallCount,
} from './support/app-test-harness';

test.use({ viewport: { width: 390, height: 844 } });

test('shows startup configuration error when required runtime env is missing', async ({ page }) => {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();

    const rewrittenBody = body.replace(RUNTIME_CLIENT_ID_PATTERN, 'VITE_AZURE_CLIENT_ID:"   "');
    if (rewrittenBody === body) {
      await route.fulfill({ response, body });
      return;
    }

    await route.fulfill({
      response,
      body: rewrittenBody,
    });
  });

  await page.goto(appPath());

  await expect(
    page.getByRole('heading', { level: 1, name: 'Startup configuration error' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Missing required environment variable(s): VITE_AZURE_CLIENT_ID.',
  );
  await expect(page.getByTestId('app-shell')).toHaveCount(0);
});

test('loads a mobile app shell and navigates primary routes', async ({ page }) => {
  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByTestId('app-nav-icon-accounts')).toHaveAttribute(
    'src',
    appPath('icons/account_55.png'),
  );
  await expect(page.getByTestId('app-nav-icon-transfers')).toHaveAttribute(
    'src',
    appPath('icons/standingorder_55.png'),
  );
  await expect(page.getByTestId('app-nav-icon-add')).toHaveAttribute(
    'src',
    appPath('icons/category_55.png'),
  );
  await expect(page.getByTestId('app-nav-icon-settings')).toHaveAttribute(
    'src',
    appPath('icons/settings_55.png'),
  );
  await expect(page.getByTestId('app-shell-bottom')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page).toHaveURL(/#\/transfers$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();

  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page).toHaveURL(/#\/add$/);
  await expect(page.getByTestId('add-transfer-database-required')).toContainText(
    'Choose a database first.',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
});

test('renders an editable add transfer bottom sheet on mobile viewports', async ({ page }) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    categoryRows: [{ categoryId: 20, name: 'Groceries' }],
  });

  await page.goto(appPath('#/add'));

  await expect(page.getByTestId('route-add')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'New Transfer' })).toBeVisible();
  await expect(page.getByTestId('add-transfer-form')).toBeVisible();

  const editableControls = [
    'add-transfer-date',
    'add-transfer-name',
    'add-transfer-amount',
    'add-transfer-from-account',
    'add-transfer-to-account',
    'add-transfer-category-1',
    'add-transfer-category-2',
    'add-transfer-category-3',
    'add-transfer-buyplace',
  ];

  for (const testId of editableControls) {
    const control = page.getByTestId(testId);
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    await expect(control).toHaveClass(/app-input/);
  }

  await page.getByTestId('add-transfer-date').fill('2024-04-15');
  await page.getByTestId('add-transfer-name').fill('Groceries');
  const amountInput = page.getByTestId('add-transfer-amount');
  await amountInput.pressSequentially('1');
  await expect(amountInput).toHaveValue('0,01€');
  await amountInput.pressSequentially('2');
  await expect(amountInput).toHaveValue('0,12€');
  await amountInput.pressSequentially('3');
  await expect(amountInput).toHaveValue('1,23€');
  await amountInput.pressSequentially('4');
  await expect(amountInput).toHaveValue('12,34€');
  await page.getByTestId('add-transfer-buyplace').fill('Supermarket');

  const submitButton = page.getByTestId('add-transfer-submit');
  await expect(submitButton).toBeEnabled();
  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  await submitButton.scrollIntoViewIfNeeded();
  await expect(submitButton).toBeInViewport();
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('12,34€');
  await expect(page.getByTestId('add-transfer-buyplace')).toHaveValue('Supermarket');
});

test('keeps add transfer form controls aligned on mobile and desktop viewports', async ({
  page,
}) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 12, name: 'Savings', amountCents: 5000, accountTypeId: 3 },
    ],
  });

  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  const mobileControlMetrics = await page.evaluate(() => {
    const dateInput = document.querySelector('[data-testid="add-transfer-date"]') as HTMLElement;
    const nameInput = document.querySelector('[data-testid="add-transfer-name"]') as HTMLElement;
    const route = document.querySelector('[data-testid="route-add"]') as HTMLElement;
    const dateBox = dateInput.getBoundingClientRect();
    const nameBox = nameInput.getBoundingClientRect();
    return {
      dateWidth: dateBox.width,
      dateHeight: dateBox.height,
      nameWidth: nameBox.width,
      nameHeight: nameBox.height,
      hasHorizontalOverflow: route.scrollWidth > route.clientWidth + 1,
    };
  });

  expect(mobileControlMetrics.dateWidth).toBeLessThanOrEqual(mobileControlMetrics.nameWidth + 1);
  expect(
    Math.abs(mobileControlMetrics.dateHeight - mobileControlMetrics.nameHeight),
  ).toBeLessThanOrEqual(2);
  expect(mobileControlMetrics.hasHorizontalOverflow).toBe(false);

  await page.setViewportSize({ width: 1024, height: 900 });
  const desktopSelectStyle = await page
    .getByTestId('add-transfer-from-account')
    .evaluate((select) => {
      const styles = getComputedStyle(select);
      return {
        matchesDesktopPointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
        appearance: styles.appearance,
        paddingRight: Number.parseFloat(styles.paddingRight),
        backgroundImage: styles.backgroundImage,
      };
    });

  if (desktopSelectStyle.matchesDesktopPointer) {
    expect(desktopSelectStyle.appearance).toBe('none');
    expect(desktopSelectStyle.paddingRight).toBeGreaterThan(40);
    expect(desktopSelectStyle.backgroundImage).not.toBe('none');
  }
});

test('keeps add transfer draft values after closing and reopening the sheet', async ({ page }) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 12, name: 'Savings', amountCents: 5000, accountTypeId: 3 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Groceries' },
      { categoryId: 30, name: 'Travel' },
      { categoryId: 40, name: 'Rent' },
    ],
  });

  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-form')).toBeVisible();

  await page.getByTestId('add-transfer-date').fill('2024-04-15');
  await page.getByTestId('add-transfer-name').fill('Draft Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1234');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Checking' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Savings' });
  await page.getByTestId('add-transfer-category-1').selectOption({ label: 'Groceries' });
  await page.getByTestId('add-transfer-category-2').selectOption({ label: 'Travel' });
  await page.getByTestId('add-transfer-category-3').selectOption({ label: 'Rent' });
  await page.getByTestId('add-transfer-buyplace').fill('Supermarket');

  await page.getByTestId('add-transfer-close').click();
  await expect(page).toHaveURL(/#\/transfers$/);

  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page).toHaveURL(/#\/add$/);
  await expect(page.getByTestId('add-transfer-form')).toBeVisible();
  await expect(page.getByTestId('add-transfer-date')).toHaveValue('2024-04-15');
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Draft Transfer');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('12,34€');
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('11');
  await expect(page.getByTestId('add-transfer-to-account')).toHaveValue('12');
  await expect(page.getByTestId('add-transfer-category-1')).toHaveValue('20');
  await expect(page.getByTestId('add-transfer-category-2')).toHaveValue('30');
  await expect(page.getByTestId('add-transfer-category-3')).toHaveValue('40');
  await expect(page.getByTestId('add-transfer-buyplace')).toHaveValue('Supermarket');
});

test('loads add transfer account and category options from the local DB runtime', async ({
  page,
}) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      { accountId: 12, name: 'Wallet', amountCents: 500, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      { accountId: 12, name: 'Wallet', amountCents: 500, accountTypeId: 3 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Groceries' },
      { categoryId: 30, name: 'Rent' },
      { categoryId: 40, name: 'Travel' },
    ],
  });

  await page.goto(appPath('#/add'));

  const fromAccountOptions = page.getByTestId('add-transfer-from-account').locator('option');
  await expect(fromAccountOptions).toHaveText([
    'Select source account',
    'INCOME',
    'Checking',
    'Wallet',
  ]);

  const toAccountOptions = page.getByTestId('add-transfer-to-account').locator('option');
  await expect(toAccountOptions).toHaveText([
    'Select destination account',
    'SPENDINGS',
    'Checking',
    'Wallet',
  ]);

  for (const testId of [
    'add-transfer-category-1',
    'add-transfer-category-2',
    'add-transfer-category-3',
  ]) {
    await expect(page.getByTestId(testId).locator('option')).toHaveText([
      'No category',
      'Groceries',
      'Rent',
      'Travel',
    ]);
  }
});

test('renders readable account cards with semantic amount styling on narrow mobile widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    accountRows: [
      {
        accountId: 101,
        name: 'Main Household Spending Account with Long Name',
        amountCents: 1234567,
      },
      {
        accountId: 102,
        name: 'Long-Term Loan',
        amountCents: -499900,
      },
      {
        accountId: 103,
        name: 'Settled Offset',
        amountCents: 0,
      },
    ],
  });

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-cards')).toBeVisible();
  await expect(page.getByText('Main Household Spending Account with Long Name')).toBeVisible();
  await expect(page.getByTestId('account-amount-positive-101')).toHaveText('+€12,345.67');
  await expect(page.getByTestId('account-amount-negative-102')).toHaveText('-€4,999.00');
  await expect(page.getByTestId('account-amount-neutral-103')).toHaveText('€0.00');

  const hasHorizontalOverflow = await page.getByTestId('route-accounts').evaluate((element) => {
    return element.scrollWidth > element.clientWidth + 1;
  });
  expect(hasHorizontalOverflow).toBe(false);

  const amountColors = await page.evaluate(() => {
    const positive = getComputedStyle(
      document.querySelector('[data-testid="account-amount-positive-101"]') as HTMLElement,
    ).color;
    const negative = getComputedStyle(
      document.querySelector('[data-testid="account-amount-negative-102"]') as HTMLElement,
    ).color;
    const neutral = getComputedStyle(
      document.querySelector('[data-testid="account-amount-neutral-103"]') as HTMLElement,
    ).color;
    return { positive, negative, neutral };
  });

  expect(amountColors.positive).not.toBe(amountColors.negative);
  expect(amountColors.neutral).not.toBe(amountColors.negative);
});

test('shows accounts empty state when no visible non-primary accounts are returned', async ({
  page,
}) => {
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    accountRows: [],
  });

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-empty')).toBeVisible();
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
});

test('shows accounts error state on query failure without breaking bottom navigation', async ({
  page,
}) => {
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    failAccountsQuery: true,
    accountsQueryErrorMessage: 'Mock accounts query failure.',
  });

  await page.goto(appPath('#/accounts'));

  await expect(page.getByRole('alert')).toContainText(
    'Failed to load visible non-primary accounts from the local SQLite database.',
  );
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('switches transfer months by buttons and swipe gestures', async ({ page }) => {
  await page.goto(appPath('#/transfers'));

  const monthLabel = page.getByTestId('transfers-month-label');
  const expectedInitialMonthKey = await resolveCurrentMonthKey(page);
  await expect(monthLabel).toBeVisible();
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await page.getByTestId('transfers-month-next-button').click();
  await expect(monthLabel).toHaveAttribute('data-month-key', /^\d{4}-\d{2}$/);
  const monthAfterNextButton = await monthLabel.getAttribute('data-month-key');
  expect(monthAfterNextButton).not.toBeNull();
  expect(monthAfterNextButton).not.toBe(expectedInitialMonthKey);

  await page.getByTestId('transfers-month-previous-button').click();
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, -120, 8);
  const monthAfterLeftSwipe = await monthLabel.getAttribute('data-month-key');
  expect(monthAfterLeftSwipe).not.toBeNull();
  expect(monthAfterLeftSwipe).not.toBe(expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, 120, 10);
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, -24, 4);
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, 30, 120);
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);
});

test('shows transfer swipe drag feedback and locks horizontal drag scroll', async ({ page }) => {
  await page.goto(appPath('#/transfers'));

  const horizontalMove = await inspectTransferMonthSwipeMove(page, -80, 6);
  expect(horizontalMove.defaultPrevented).toBe(true);
  expect(horizontalMove.trackTransform).toBe('translateX(-28px)');

  const verticalMove = await inspectTransferMonthSwipeMove(page, 8, 80);
  expect(verticalMove.defaultPrevented).toBe(false);
  expect(verticalMove.trackTransform).toBe('translateX(0px)');
});

test('reuses the cached DB on startup when the OneDrive eTag is unchanged', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-1"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('force refresh downloads an unchanged DB and reports progress plus the new sync timestamp', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-1"',
    downloadDelayMs: 1_200,
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await installMockDbRuntime(page, { forceAlwaysOpen: true });

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('force-refresh-button')).toBeEnabled();
  const initialLastSync = await page.getByTestId('settings-last-sync').textContent();
  const metadataCallsBeforeRefresh = await getGraphMetadataCallCount(page);

  await page.getByTestId('force-refresh-button').click();

  await expect(page.getByTestId('force-refresh-button')).toBeDisabled();
  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.getByTestId('force-refresh-status')).toContainText(
    'Checking OneDrive for DB updates...',
  );
  await expect(page.getByTestId('force-refresh-status')).toContainText(
    'Downloaded the latest DB from OneDrive.',
  );
  await expect(page.getByTestId('force-refresh-button')).toBeEnabled();

  const refreshedLastSync = await page.getByTestId('settings-last-sync').textContent();
  expect(refreshedLastSync).not.toBe(initialLastSync);
  expect(await getGraphMetadataCallCount(page)).toBe(metadataCallsBeforeRefresh + 1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('force refresh reports an offline failure and remains retryable', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/settings'));

  const refreshButton = page.getByTestId('force-refresh-button');
  await expect(refreshButton).toBeEnabled();
  await refreshButton.click();

  await expect(page.getByTestId('force-refresh-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('force-refresh-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(refreshButton).toBeEnabled();
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('preserves the selected transfer month while refreshing in the foreground', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETagSequence: ['"etag-1"', '"etag-2"'],
    metadataDelayMs: 600,
    downloadBytes: createSqliteBytes([9, 8, 7, 6]),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await installMockDbRuntime(page, { forceAlwaysOpen: true });

  await page.goto(appPath('#/transfers'));

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  await page.getByTestId('transfers-month-previous-button').click();
  const selectedMonthKey = await page
    .getByTestId('transfers-month-label')
    .getAttribute('data-month-key');
  expect(selectedMonthKey).not.toBeNull();

  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.getByTestId('route-transfers')).toBeVisible();
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    selectedMonthKey!,
  );
  await expect.poll(() => getGraphMetadataCallCount(page)).toBe(2);
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    selectedMonthKey!,
  );
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('shows one startup status surface while the freshness check is running', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataDelayMs: 3_500,
    metadataETag: '"etag-1"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([6, 6, 6, 6]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.getByTestId('route-accounts')).toHaveCount(0);
  await expect(page.getByTestId('progress-bar')).not.toHaveAttribute('value', /.+/u);

  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  await expect(page.getByTestId('route-transfers')).toHaveCount(0);

  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByTestId('route-settings')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#/add';
  });
  await expect(page.getByTestId('route-add')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#/accounts';
  });

  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  await expect(page.getByTestId('startup-sync-progress')).toHaveCount(0);
  await expect(page.getByTestId('route-accounts')).toBeVisible();
});

test('shows download progress feedback during slow startup sync', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadDelayMs: 2000,
    downloadBytes: createSqliteBytes(Array.from({ length: 10224 }, (_, i) => i % 256)), // 10 KB total
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('progress-indicator')).toBeVisible();
  await expect(page.getByTestId('progress-indicator')).toHaveAttribute('data-kind', 'download');

  const progressBar = page.getByTestId('progress-bar');
  await expect(progressBar).toHaveAttribute('max', '10240');

  // Verify it starts at ~50% (5KB) due to our mock half-way call
  await expect
    .poll(async () => {
      const value = await progressBar.getAttribute('value');
      return value ? parseInt(value, 10) : 0;
    })
    .toBeGreaterThanOrEqual(5120);

  await expect(page.getByTestId('progress-text')).toContainText('5 KB / 10 KB');

  // Wait for it to finish
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect(page.getByTestId('progress-indicator')).toHaveCount(0);
});

test('silently repairs a changed OneDrive item ID at the exact saved path', async ({ page }) => {
  const oldBinding = {
    driveId: 'drive-123',
    itemId: 'old-safe-save-id',
    name: 'conspectus.db',
    parentPath: '/',
  };
  const recoveredBinding = { ...oldBinding, itemId: 'new-safe-save-id' };
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('not_found', 'Old safe-save item ID is gone.', 404),
    ],
    resolvedPathBinding: recoveredBinding,
    metadataETag: '"etag-recovered"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      binding: oldBinding,
      metadata: { eTag: '"etag-old"' },
      dbBytes: createSqliteBytes([9, 9, 9]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 7, name: 'Recovered account', amountCents: 12_300, accountTypeId: 3 },
    ],
  });
  await installPersistedBinding(page, oldBinding);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect(page.getByText('Recovered account')).toBeVisible();
  await expect(page.getByTestId('missing-file-recovery')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem('conspectus.selectedDriveItemBinding');
        if (rawValue === null) {
          return null;
        }
        return JSON.parse(rawValue).bindingsByAccountId['mock-home-account'];
      }),
    )
    .toEqual(recoveredBinding);

  await page.waitForTimeout(250);
  expect(await getGraphResolvePathCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(2);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('keeps the app usable and offers rebind when the exact saved path is missing', async ({
  page,
}) => {
  const oldBinding = {
    driveId: 'drive-123',
    itemId: 'deleted-item-id',
    name: 'conspectus.db',
    parentPath: '/',
  };
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, {
    metadataErrorSequence: [createMockGraphError('not_found', 'Deleted item ID.', 404)],
    resolvePathError: createMockGraphError('not_found', 'No file at the saved path.', 404),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      binding: oldBinding,
      metadata: { eTag: '"etag-stale"' },
      dbBytes: createSqliteBytes([8, 8, 8]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 8, name: 'Account after rebind', amountCents: 45_600, accountTypeId: 3 },
    ],
  });
  await installPersistedBinding(page, oldBinding);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('missing-file-recovery')).toBeVisible();
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  await expect(page.getByText('Account after rebind')).toHaveCount(0);
  expect(await getGraphResolvePathCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem('conspectus.selectedDriveItemBinding');
        return rawValue === null
          ? null
          : JSON.parse(rawValue).bindingsByAccountId['mock-home-account'].itemId;
      }),
    )
    .toBe(oldBinding.itemId);

  await page.getByTestId('missing-file-recovery-button').click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();
  await page.getByRole('button', { name: 'Change DB file' }).click();
  await page.getByTestId('open-folder-folder-finance').click();
  await page.getByTestId('select-file-file-finance-db').click();

  await expect(page.getByTestId('missing-file-recovery')).toHaveCount(0);
  await expect(page.getByText('Downloaded the latest DB from OneDrive.').last()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem('conspectus.selectedDriveItemBinding');
        return rawValue === null
          ? null
          : JSON.parse(rawValue).bindingsByAccountId['mock-home-account'];
      }),
    )
    .toMatchObject({
      driveId: 'drive-123',
      itemId: 'file-finance-db',
      name: 'budget.db',
      parentPath: '/Finance',
    });

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByText('Account after rebind')).toBeVisible();
});

test('retries transient startup metadata failures before settling on the cached DB state', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
    ],
    metadataETag: '"etag-1"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([3, 3, 3, 3]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('rejects cached account data when transient startup metadata failures exhaust retries', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
    ],
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([3, 3, 3, 3]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 99, name: 'Stale cached account', amountCents: 999_999, accountTypeId: 3 },
    ],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  await expect(page.getByText('Stale cached account')).toHaveCount(0);
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
  expect(await getDbRuntimeCloseCallCount(page)).toBeGreaterThan(0);
});

test('shows a startup sync error when transient metadata failures exhaust retries without a cached DB', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('fails fast on non-retryable startup metadata errors and surfaces the clear reason', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [createMockGraphError('forbidden', 'Mock access denied.', 403)],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText('Mock access denied.');
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('starts one safe re-authentication and preserves the current screen after token expiry', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
    reauthenticateDelayMs: 250,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError(
        'unauthorized',
        'Your session has expired. Please sign in again to sync with OneDrive.',
        401,
      ),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/transfers'));

  await expect(page.getByTestId('transfers-route-status')).toContainText(
    'Your session has expired. Please sign in again to sync with OneDrive.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);

  const recoveryButton = page.getByTestId('stale-token-recovery-button');
  const previousUrl = page.url();
  await expect(recoveryButton).toBeVisible();
  await recoveryButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(recoveryButton).toBeDisabled();
  await expect(recoveryButton).toHaveAttribute('aria-busy', 'true');
  await expect(recoveryButton).toBeEnabled();

  const redirectStartPages = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __CONSPECTUS_REAUTHENTICATE_START_PAGES__?: string[];
        }
      ).__CONSPECTUS_REAUTHENTICATE_START_PAGES__,
  );
  expect(redirectStartPages).toEqual([previousUrl]);
  await expect(page).toHaveURL(previousUrl);
  await expect(page.getByTestId('route-transfers')).toBeVisible();
});

test('keeps stale-token recovery retryable on the current screen when redirect startup fails', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
    failReauthenticate: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError(
        'unauthorized',
        'Your session has expired. Please sign in again to sync with OneDrive.',
        401,
      ),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));
  const previousUrl = page.url();
  const recoveryButton = page.getByTestId('stale-token-recovery-button');
  await recoveryButton.click();

  await expect(page.getByTestId('stale-token-recovery-error')).toContainText(
    'Mock re-authentication failure.',
  );
  await expect(recoveryButton).toBeEnabled();
  await expect(recoveryButton).toHaveAttribute('aria-busy', 'false');
  await expect(page).toHaveURL(previousUrl);
  await expect(page.getByTestId('route-accounts')).toBeVisible();
});

test('downloads a fresh DB on startup when the OneDrive eTag changed', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadBytes: createSqliteBytes([5, 4, 3, 2]),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('retries transient startup download failures before downloading the latest DB', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
    ],
    downloadBytes: createSqliteBytes([5, 4, 3, 2]),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
});

test('rejects cached transfer data when transient startup download failures exhaust retries', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
    ],
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 3, name: 'Checking', amountCents: 1_000, accountTypeId: 3 },
      { accountId: 4, name: 'Savings', amountCents: 2_000, accountTypeId: 3 },
    ],
    transferRows: [
      {
        transferId: 99,
        bookingDateEpochDay: Math.floor(Date.now() / 86_400_000),
        name: 'Stale cached transfer',
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 4,
        categoryIds: [],
        buyplace: null,
      },
    ],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/transfers'));

  await expect(page.getByTestId('transfers-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('transfers-route-status')).toContainText(
    'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  await expect(page.getByTestId('transfers-route-cards')).toHaveCount(0);
  await expect(page.getByText('Stale cached transfer')).toHaveCount(0);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();
});

test('shows a startup sync error when transient download failures exhaust retries without a cached DB', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
});

test('rejects the cached DB and offers sign-in again when download auth expires', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError(
        'unauthorized',
        'Your session has expired. Please sign in again to sync with OneDrive.',
        401,
      ),
    ],
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Your session has expired. Please sign in again to sync with OneDrive.',
  );
  await expect(page.getByTestId('accounts-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
});

test('rejects cached DB data when startup is offline', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([4, 4, 4, 4]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(page.getByTestId('accounts-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  expect(await getCacheReadSnapshotCallCount(page)).toBe(0);
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('shows a startup sync error when offline without a cached DB', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(page.getByTestId('accounts-route-status')).toBeVisible();
  expect(await getCacheReadSnapshotCallCount(page)).toBe(0);
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('triggers a fresh sync after a successful DB file selection', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/settings'));

  await expect(page.getByText('Cached DB is current with OneDrive.').first()).toBeVisible();
  const initialLastSync = await page.getByTestId('settings-last-sync').textContent();
  expect(initialLastSync).toContain('2026');

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await page.getByTestId('select-file-file-root-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByText('Cached DB is current with OneDrive.').last()).toBeVisible();
  const expectedLastSync = await page.evaluate(() => {
    const timestamp = (window as Window & { __CONSPECTUS_LAST_WRITTEN_SYNC_AT__?: string })
      .__CONSPECTUS_LAST_WRITTEN_SYNC_AT__;
    if (timestamp === undefined) {
      return null;
    }
    return `${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
      hour12: false,
    }).format(new Date(timestamp))} UTC`;
  });
  expect(expectedLastSync).not.toBeNull();
  await expect(page.getByTestId('settings-last-sync')).toHaveText(expectedLastSync ?? '');

  expect(await getCacheReadSnapshotCallCount(page)).toBe(6);
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('restored binding triggers sync after interactive sign-in without reload', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: false,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('auth-status-message')).toContainText('Signed out.');
  await expect(page.locator('.toast')).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();

  expect(await getCacheReadSnapshotCallCount(page)).toBe(3);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('shows deployment footer metadata immediately on short pages', async ({ page }) => {
  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('deployment-info-footer')).toBeVisible();
  await expect(page.getByTestId('deployment-info-footer')).not.toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect(page.getByTestId('deployment-info-label')).toHaveText(/^Ver\. \S+ .+ \d{2}:\d{2}$/u);

  const navBox = await page.getByRole('navigation', { name: 'Primary' }).boundingBox();
  const footerBox = await page.getByTestId('deployment-info-footer').boundingBox();

  expect(navBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThan(navBox!.y + navBox!.height - 1);
});

test('reveals deployment footer only when reaching the end of a scrollable page', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    extraRootDbFileCount: 80,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();

  const appContent = page.getByTestId('app-shell-content');
  const footer = page.getByTestId('deployment-info-footer');
  const appShellBottom = page.getByTestId('app-shell-bottom');

  await expect
    .poll(async () =>
      appContent.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
    )
    .toEqual(
      expect.objectContaining({
        clientHeight: expect.any(Number),
        scrollHeight: expect.any(Number),
      }),
    );

  await expect
    .poll(async () =>
      appContent.evaluate((element) => element.scrollHeight > element.clientHeight + 24),
    )
    .toBe(true);

  await expect(footer).toHaveAttribute('aria-hidden', 'true');
  await expect(appShellBottom).toHaveClass(/app-shell__bottom--with-safe-area/);

  await footer.evaluate((element) => {
    const footerElement = element as HTMLElement;
    const trackedWindow = window as typeof window & {
      __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
      __CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__?: MutationObserver;
    };

    trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ = 0;

    const observer = new MutationObserver((mutations) => {
      trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ =
        (trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ ?? 0) +
        mutations.filter((mutation) => mutation.attributeName === 'aria-hidden').length;
    });

    observer.observe(footerElement, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
    });

    trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__ = observer;
  });

  await appContent.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(footer).not.toHaveAttribute('aria-hidden', 'true');
  await expect(appShellBottom).not.toHaveClass(/app-shell__bottom--with-safe-area/);
  await page.waitForTimeout(300);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
            }
          ).__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ ?? 0,
      ),
    )
    .toBe(1);

  await appContent.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(footer).toHaveAttribute('aria-hidden', 'true');
  await expect(appShellBottom).toHaveClass(/app-shell__bottom--with-safe-area/);
  await page.waitForTimeout(300);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
            }
          ).__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ ?? 0,
      ),
    )
    .toBe(2);

  await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
      __CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__?: MutationObserver;
    };

    trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__?.disconnect();
    delete trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__;
    delete trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__;
  });
});

test('loads transfers from real DB bytes and navigates months to see fixture data', async ({
  page,
}) => {
  const fixtureBytes = Array.from(
    fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/test.db')),
  );

  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, { metadataETag: '"etag-1"' });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: { eTag: '"etag-1"' },
      dbBytes: fixtureBytes,
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  // We set the date to April 15, 2024 to target our fixture data months.
  await page.clock.setFixedTime(new Date('2024-04-15T12:00:00.000Z'));

  await page.goto(appPath('#/transfers'));

  const monthLabel = page.getByTestId('transfers-month-label');
  await expect(monthLabel).toBeVisible();

  await expect(monthLabel).toHaveAttribute('data-month-key', '2024-04');
  await expect(page.getByTestId('transfer-card-2')).toBeVisible();
  const categorylessTransferCard = page.getByTestId('transfer-card-3');
  await expect(categorylessTransferCard).toBeVisible();
  expect(
    await categorylessTransferCard.evaluate((card) => window.getComputedStyle(card).paddingBottom),
  ).toBe('6.4px');

  await page.getByTestId('transfers-month-previous-button').click();
  await expect(monthLabel).toHaveAttribute('data-month-key', '2024-03');
  await expect(page.getByTestId('transfer-card-1')).toBeVisible();
});

test('supports sign-in and sign-out auth UX states in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    signInDelayMs: 250,
    signOutDelayMs: 250,
  });

  await page.goto(appPath('#/settings'));

  const statusMessage = page.getByTestId('auth-status-message');
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
  const safetyNotice = page.getByTestId('settings-safety-recovery');
  await expect(safetyNotice).toBeVisible();
  await expect(safetyNotice).toContainText(
    'Close the desktop app before using Conspectus Mobile. Never use both apps at the same time.',
  );
  await expect(safetyNotice).toContainText('file version history for 30 days');
  const recoveryLink = safetyNotice.getByRole('link', {
    name: "Read Microsoft's OneDrive recovery instructions",
  });
  await expect(recoveryLink).toHaveAttribute(
    'href',
    'https://support.microsoft.com/en-us/onedrive/restore-a-previous-version-of-a-file-stored-in-onedrive',
  );
  const recoveryLinkBox = await recoveryLink.boundingBox();
  expect(recoveryLinkBox).not.toBeNull();
  expect(recoveryLinkBox?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(statusMessage).toContainText('Signed out.');

  const signInButton = page.getByRole('button', { name: 'Sign in with Microsoft' });
  await signInButton.click();

  await expect(statusMessage).toContainText('Opening Microsoft sign-in...');
  await expect(signInButton).toBeDisabled();
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByText('mock-user@example.com')).toBeVisible();
  await expect(statusMessage).toContainText('Signed in.');

  const signOutButton = page.getByRole('button', { name: 'Sign out' });
  await signOutButton.click();

  await expect(statusMessage).toContainText('Signing out...');
  await expect(signOutButton).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(statusMessage).toContainText('Signed out.');
});

test('allows selecting a OneDrive .db file from the settings browser', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );

  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByText('Finance')).toBeVisible();
  await expect(page.getByText('conspectus.db')).toBeVisible();
  await expect(page.getByText('notes.txt')).toHaveCount(0);

  await page.getByTestId('open-folder-folder-finance').click();
  await expect(page.getByText('/Finance')).toBeVisible();
  await expect(page.getByText('budget.db')).toBeVisible();

  await page.getByTestId('select-file-file-finance-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/Finance');
  await expect(page.getByTestId('settings-last-sync')).not.toBeEmpty();
  await expect(page.getByTestId('settings-build-version')).not.toBeEmpty();
  await expect(page.getByTestId('settings-build-time')).not.toBeEmpty();
  await page.getByTestId('settings-build-information').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('settings-build-information')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByTestId('open-folder-folder-finance')).toBeVisible();
  await expect(page.getByTestId('select-file-file-root-db')).toBeVisible();

  await page.getByTestId('select-file-file-root-db').click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
});

test('shows an in-panel loading state while OneDrive browse results are pending', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    listChildrenDelayMs: 1_500,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByTestId('binding-status-message')).toContainText(
    'Loading OneDrive files...',
  );
  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByTestId('db-file-browser')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Loading the current OneDrive folder...')).toBeVisible();
  await expect(page.getByTestId('db-file-browser-loading')).toBeVisible();

  await expect(page.getByTestId('open-folder-folder-finance')).toBeVisible();
  await expect(page.getByTestId('db-file-browser')).toHaveAttribute('aria-busy', 'false');
});

test('keeps the selected DB file after reload', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();
  expect(await getGraphListChildrenCallCount(page)).toBe(1);

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);

  await page.reload();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  expect(await getGraphListChildrenCallCount(page)).toBe(0);
});

test('allows cancelling a DB file rebind without changing the current selection', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByTestId('cancel-db-file-browser-button')).toBeVisible();

  await page.getByTestId('cancel-db-file-browser-button').click();

  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
});

test('resets local app data only after destructive confirmation', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    clearAllDelayMs: 250,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');

  await page.getByTestId('reset-local-app-data-button').click();
  await expect(page.getByTestId('reset-local-app-data-confirmation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('reset-local-app-data-confirmation')).not.toBeVisible();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  expect(await getCacheClearAllCallCount(page)).toBe(0);

  await page.getByTestId('reset-local-app-data-button').click();
  await page.getByTestId('confirm-reset-local-app-data-button').click();
  await expect(page.getByTestId('reset-local-app-data-confirmation')).toContainText(
    'Resetting local app data...',
  );
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeDisabled();

  await expect(page.getByTestId('reset-local-app-data-confirmation')).not.toBeVisible();
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);
  expect(await getCacheClearAllCallCount(page)).toBe(1);

  const persistedBindingValue = await page.evaluate(() =>
    window.localStorage.getItem('conspectus.selectedDriveItemBinding'),
  );
  expect(persistedBindingValue).toBeNull();

  await page.reload();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);
});

test('restores selected DB file after startup on a non-settings route', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
  expect(await getGraphListChildrenCallCount(page)).toBe(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
});

test('shows browse errors without pretending the OneDrive folder is empty', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    failListChildren: true,
  });

  await page.goto(appPath('#/settings'));

  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByRole('alert')).toContainText('Mock OneDrive browse failure.');
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Mock OneDrive browse failure.',
  );
  await expect(page.getByText('No folders or .db files found here.')).toHaveCount(0);
});

test('shows binding error when token acquisition fails during OneDrive browse', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
    failGetAccessToken: true,
    getAccessTokenErrorCode: 'interaction_required',
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Authentication is required to access the selected OneDrive file.',
  );
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Authentication is required to access the selected OneDrive file.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);
});

test('shows validation error for malformed .db selection and does not persist a binding', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    includeMalformedDbFile: true,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-malformed-db').click();

  await expect(page.getByRole('alert')).toContainText(
    'Selected file did not include the required OneDrive identifiers.',
  );
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Selected file did not include the required OneDrive identifiers.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);

  const persistedBindingValue = await page.evaluate(() =>
    window.localStorage.getItem('conspectus.selectedDriveItemBinding'),
  );
  expect(persistedBindingValue).toBeNull();
});

test('processes redirect auth hash before route navigation and keeps signed-in status', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    consumeRedirectHashOnInitialize: true,
  });

  await page.goto(appPath('#code=mock-auth-code&state=mock-auth-state'));

  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
});

test('shows auth error UI when sign-in fails in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    failSignIn: true,
  });

  await page.goto(appPath('#/settings'));

  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByRole('alert')).toContainText('Mock sign-in failure.');
  await expect(page.getByTestId('auth-status-message')).toContainText(
    'Authentication error. Mock sign-in failure.',
  );
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
});

test('keeps hash route stable across direct loads and reloads', async ({ page }) => {
  const initialResponse = await page.goto(appPath('#/transfers'));
  expect(initialResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();

  const reloadResponse = await page.reload();
  expect(reloadResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();
});

test('does not trap browser back navigation from fallback hash route', async ({ page }) => {
  await page.goto(appPath('#/'));
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page).toHaveURL(/#\/transfers$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('falls back safely on invalid hash routes', async ({ page }) => {
  const initialResponse = await page.goto(appPath('#/unknown'));
  expect(initialResponse?.status()).toBe(200);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('exposes manifest and registers service worker', async ({ context, page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(globalThis, '__conspectusCspViolations', { value: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });

  const appResponse = await page.goto(appPath());
  expect(appResponse?.status()).toBe(200);

  const responseHeaders = appResponse?.headers() ?? {};
  const documentCsp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(documentCsp).toBeTruthy();
  expect(responseHeaders['content-security-policy']).toBe(`${documentCsp}; frame-ancestors 'none'`);
  expect(responseHeaders['x-content-type-options']).toBe('nosniff');
  expect(responseHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
  await page.evaluate(async () => document.fonts.ready);
  const cspViolations = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __conspectusCspViolations?: string[];
        }
      ).__conspectusCspViolations ?? [],
  );
  expect(cspViolations).toEqual([]);

  const manifestResponse = await page.request.get(appPath('manifest.webmanifest'));
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = (await manifestResponse.json()) as {
    name?: string;
    display?: string;
    start_url?: string;
    scope?: string;
    icons?: Array<{ src?: string; sizes?: string }>;
  };

  expect(manifest.name).toBe('Conspectus Mobile');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe(APP_BASE_PATH);
  expect(manifest.scope).toBe(APP_BASE_PATH);
  expect(manifest.theme_color).toBe('#f3f4f6');
  expect(manifest.background_color).toBe('#f3f4f6');

  const colorScheme = await page.locator('meta[name="color-scheme"]').getAttribute('content');
  expect(colorScheme).toBe('light dark');

  const themeColors = await page.locator('meta[name="theme-color"]').evaluateAll((elements) =>
    elements.map((element) => ({
      media: element.getAttribute('media'),
      content: element.getAttribute('content'),
    })),
  );
  expect(themeColors).toContainEqual({
    media: '(prefers-color-scheme: light)',
    content: '#f3f4f6',
  });
  expect(themeColors).toContainEqual({
    media: '(prefers-color-scheme: dark)',
    content: '#111827',
  });

  const manifestIcons = manifest.icons ?? [];
  expect(manifestIcons.length).toBeGreaterThan(0);

  for (const expectedIcon of REQUIRED_MANIFEST_ICONS) {
    expect(manifestIcons).toContainEqual(
      expect.objectContaining({
        src: expectedIcon.src,
        sizes: expectedIcon.sizes,
      }),
    );

    const iconResponse = await page.request.get(appPath(expectedIcon.src));
    expect(iconResponse.ok()).toBeTruthy();
  }

  const appleTouchIconHref = await page
    .locator('link[rel="apple-touch-icon"]')
    .first()
    .getAttribute('href');
  expect(appleTouchIconHref).toBe(appPath('icons/moneysack180x180.png'));

  const appleTouchIconResponse = await page.request.get(appPath('icons/moneysack180x180.png'));
  expect(appleTouchIconResponse.ok()).toBeTruthy();

  const expectedServiceWorkerScope = new URL(APP_BASE_PATH, page.url()).toString();

  await expect
    .poll(
      async () =>
        page.evaluate(async (appBasePath) => {
          if (!('serviceWorker' in navigator)) {
            return '';
          }

          const registration = await navigator.serviceWorker.getRegistration(appBasePath);
          if (!registration?.active) {
            return '';
          }

          return registration.scope;
        }, APP_BASE_PATH),
      { timeout: 15_000 },
    )
    .toBe(expectedServiceWorkerScope);

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBeTruthy();

  await context.setOffline(true);
  try {
    const offlineNavigationResponse = await page.reload();
    expect(offlineNavigationResponse?.status()).toBe(200);
    expect(offlineNavigationResponse?.headers()).toMatchObject({
      'content-security-policy': `${documentCsp}; frame-ancestors 'none'`,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
    await expect(page.getByTestId('app-shell')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('prompts for an available service worker update and reloads into it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One real-worker update smoke is sufficient.');

  const serviceWorkerPath = path.join(process.cwd(), 'dist', 'sw.js');
  const originalServiceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');

  try {
    await page.goto(appPath());
    await expect
      .poll(
        () =>
          page.evaluate(async (appBasePath) => {
            const registration = await navigator.serviceWorker.getRegistration(appBasePath);
            return Boolean(registration?.active);
          }, APP_BASE_PATH),
        { timeout: 15_000 },
      )
      .toBeTruthy();

    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBeTruthy();

    fs.writeFileSync(
      serviceWorkerPath,
      `${originalServiceWorker}\n// playwright-update-${Date.now()}\n`,
    );

    await page.evaluate(async (appBasePath) => {
      const registration = await navigator.serviceWorker.getRegistration(appBasePath);
      if (!registration) {
        throw new Error('Expected an active service worker registration.');
      }
      await registration.update();
    }, APP_BASE_PATH);

    await expect(page.getByTestId('service-worker-update-banner')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('service-worker-update-button')).toHaveText('Update now');

    await Promise.all([
      page.waitForEvent('framenavigated'),
      page.getByTestId('service-worker-update-button').click(),
    ]);

    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('service-worker-update-banner')).toHaveCount(0);
  } finally {
    fs.writeFileSync(serviceWorkerPath, originalServiceWorker);
  }
});

const seedAndBindTestDb = async (
  page: import('@playwright/test').Page,
  graphOptions: MockGraphClientOptions = {},
  dbRuntimeOptions: Partial<MockDbRuntimeOptions> = {},
) => {
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
      ...dbRuntimeOptions,
    },
    graphOptions,
  );
};

test('saves transfer happy path, transitions through upload states, and updates sync feedback', async ({
  page,
}) => {
  await seedAndBindTestDb(page, { uploadDelayMs: 200 });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Happy Path E2E Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1550');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });
  await page.getByTestId('add-transfer-category-1').selectOption({ label: 'Lebensmittel' });

  await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
  await page.getByTestId('add-transfer-submit').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  await expect(page.getByTestId('add-transfer-success-status')).toBeInViewport();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBe(0);
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-to-account')).toHaveValue('');

  await page.goto(appPath('#/transfers'));
  await expect(page.getByRole('heading', { name: 'Transfers' })).toBeVisible();
  await expect(page.getByTestId('transfer-card-999')).toContainText('Happy Path E2E Transfer');

  await page.goto(appPath('#/accounts'));
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="3"]'),
  ).toHaveAttribute('data-amount-cents', '-550');
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="4"]'),
  ).toHaveAttribute('data-amount-cents', '1550');
});

test('scrolls add transfer validation errors into view after submit', async ({ page }) => {
  await seedAndBindTestDb(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBeGreaterThan(0);

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-validation-error').first()).toBeInViewport();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBe(0);
});

test('blocks a cleared transfer date before any local write or upload', async ({ page }) => {
  await seedAndBindTestDb(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-date').fill('');
  await page.getByTestId('add-transfer-name').fill('Valid transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  await page.getByTestId('add-transfer-submit').click();

  expect(
    await page
      .getByTestId('add-transfer-date')
      .evaluate((input) => (input as HTMLInputElement).validity.valueMissing),
  ).toBe(true);
  expect(await getLocalTransferWriteCallCount(page)).toBe(0);
  expect(await getGraphUploadCallCount(page)).toBe(0);
});

test('shows determinate upload progress during slow upload', async ({ page }) => {
  await seedAndBindTestDb(page, { uploadDelayMs: 2000 });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Slow Upload Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  await page.getByTestId('add-transfer-submit').click();

  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-indicator'),
  ).toBeVisible();
  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-bar'),
  ).toHaveAttribute('value', '10');
  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-bar'),
  ).toHaveAttribute('max', '20');
  await expect(page.getByTestId('add-transfer-success-status')).toHaveCount(0);

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.', {
    timeout: 15000,
  });
});

test('defers foreground refresh until an active upload completes', async ({ page }) => {
  await seedAndBindTestDb(page, {
    metadataETag: '"etag-2"',
    uploadDelayMs: 2000,
  });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Foreground Upload Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });
  await page.getByTestId('add-transfer-submit').click();

  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-indicator'),
  ).toBeVisible();
  const metadataCallsBeforeForegroundEvent = await getGraphMetadataCallCount(page);

  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.waitForTimeout(250);
  expect(await getGraphMetadataCallCount(page)).toBe(metadataCallsBeforeForegroundEvent);

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.', {
    timeout: 15000,
  });
  await expect
    .poll(() => getGraphMetadataCallCount(page))
    .toBe(metadataCallsBeforeForegroundEvent + 1);
});

test('keeps a failed upload retryable after hash navigation without a second local write', async ({
  page,
}) => {
  await seedAndBindTestDb(page, {
    uploadErrorSequence: [{ code: 'network_error', message: 'Failed to upload' }],
  });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Retry Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1000');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-form-error')).toBeVisible();
  await expect(page.getByTestId('add-transfer-retry')).toBeVisible();
  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBeGreaterThan(0);

  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });

  await expect(page.getByTestId('route-transfers')).toBeVisible();
  await expect(page.getByTestId('pending-transfer-sync')).toBeVisible();
  await expect(page.getByTestId('pending-transfer-retry')).toBeEnabled();

  await page.getByTestId('pending-transfer-retry').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  await expect(page.getByTestId('pending-transfer-sync')).not.toBeVisible();
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
});

test('recovers from OneDrive upload conflict by refreshing the DB before resubmitting', async ({
  page,
}) => {
  await seedAndBindTestDb(
    page,
    {
      uploadErrorSequence: [{ code: 'conflict', message: 'Precondition Failed' }],
      downloadDelayMs: 2000,
    },
    { forceAlwaysOpen: false },
  );
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
  await expect(page.getByTestId('add-transfer-from-account').locator('option')).toHaveText([
    'Select source account',
    'Girokonto',
  ]);

  await page.getByTestId('add-transfer-name').fill('Conflict Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1000');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  const initialOpenCount = await getDbRuntimeOpenCallCount(page);
  const initialCloseCount = await getDbRuntimeCloseCallCount(page);
  const initialDownloadCount = await getGraphDownloadCallCount(page);

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-conflict-dialog')).toBeVisible();
  await expect(page.getByTestId('add-transfer-conflict-dialog')).toContainText(
    'OneDrive has newer data',
  );
  await expect(page.getByTestId('add-transfer-conflict-dialog')).not.toContainText(
    'Precondition Failed',
  );
  await expect(page.getByTestId('add-transfer-conflict-dialog')).not.toContainText('412');
  await expect(page.getByTestId('add-transfer-conflict-dialog')).not.toContainText('eTag');
  await expect(page.getByTestId('add-transfer-retry')).not.toBeVisible();
  await expect(page.getByTestId('add-transfer-resolve-conflict')).toBeVisible();
  await expect(page.getByTestId('add-transfer-submit')).not.toBeVisible();
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Conflict Transfer');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('10,00€');
  await expect(await getDbRuntimeCloseCallCount(page)).toBeGreaterThan(initialCloseCount);

  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  await expect(page.getByTestId('pending-transfer-sync')).toBeVisible();
  await expect(page.getByTestId('pending-transfer-recover')).toBeEnabled();

  await page.getByTestId('pending-transfer-recover').click();

  await expect(page.getByTestId('pending-transfer-sync')).not.toBeVisible({ timeout: 10000 });
  await page.evaluate(() => {
    window.location.hash = '#/add';
  });
  await expect(page.getByTestId('add-transfer-submit')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Conflict Transfer');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('10,00€');
  expect(await getGraphDownloadCallCount(page)).toBeGreaterThan(initialDownloadCount);
  expect(await getDbRuntimeOpenCallCount(page)).toBeGreaterThan(initialOpenCount);

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
});

test('blocks transfers when app is offline', async ({ page, context }) => {
  await seedAndBindTestDb(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await context.setOffline(true);

  await expect(page.getByTestId('add-transfer-offline-warning')).toBeVisible();
  await expect(page.getByTestId('add-transfer-submit')).toBeDisabled();
});
