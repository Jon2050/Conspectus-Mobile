import { expect, test } from '@playwright/test';
import { appPath, installReadyAddTransferTestDb } from './support/app-test-harness';

const accounts = [
  { accountId: 1, name: 'Income with custom name', amountCents: 0, accountTypeId: 1 },
  { accountId: 2, name: 'Spendings with custom name', amountCents: 0, accountTypeId: 2 },
  { accountId: 3, name: 'Checking account', amountCents: 10000, accountTypeId: 3 },
];

test('starts every settings section collapsed and keeps each section independently toggleable', async ({
  page,
}, testInfo) => {
  await installReadyAddTransferTestDb(page);
  await page.goto(appPath('#/settings'));
  const sections = page.locator('.settings-section');
  await expect(sections).toHaveCount(5);
  for (const section of await sections.all()) {
    await expect(section).not.toHaveAttribute('open');
  }
  await expect(page.getByTestId('settings-safety-recovery')).not.toBeVisible();
  await expect(page.getByTestId('openrouter-settings')).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('settings-collapsed.png') });
  const database = page.getByTestId('settings-database-section');
  await database.locator('summary').click();
  await expect(page.getByTestId('binding-status-message')).toBeVisible();
  const receipt = page.getByTestId('settings-receipt-section');
  await receipt.locator('summary').click();
  await expect(page.getByTestId('openrouter-settings')).toBeVisible();
  await database.locator('summary').click();
  await expect(page.getByTestId('binding-status-message')).not.toBeVisible();
  await expect(receipt).toHaveAttribute('open', '');
  await page.getByTestId('settings-safety-section').locator('summary').click();
  await expect(page.getByTestId('settings-safety-recovery')).toBeVisible();
  await page.reload();
  await expect(sections).toHaveCount(5);
  await expect(page.locator('.settings-section[open]')).toHaveCount(0);
});

test('defaults manual accounts by type, preserves the draft and restores defaults after saving', async ({
  page,
}, testInfo) => {
  await installReadyAddTransferTestDb(page, {
    accountRows: accounts,
    fromAccountOptionRows: [accounts[0], accounts[2]],
    toAccountOptionRows: [accounts[1], accounts[2]],
  });
  await page.goto(appPath('#/add'));
  const from = page.getByTestId('add-transfer-from-account');
  const to = page.getByTestId('add-transfer-to-account');
  await expect(from).toHaveValue('1');
  await expect(to).toHaveValue('2');
  await expect(page.getByTestId('bottom-sheet-close')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('manual-transfer.png') });
  await from.selectOption('3');
  await page.getByTestId('add-transfer-name').fill('Draft purchase');
  await page.getByTestId('add-transfer-amount').pressSequentially('1250');
  await page.getByTestId('add-transfer-close').click();
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await expect(from).toHaveValue('3');
  await expect(to).toHaveValue('2');
  await page.getByTestId('add-transfer-submit').click();
  await expect(page.getByTestId('add-transfer-success-status')).toBeVisible();
  await expect(from).toHaveValue('1');
  await expect(to).toHaveValue('2');
});

test('right-aligns categories beside accounts and on their own wrapped rows', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  await installReadyAddTransferTestDb(page, {
    forceAlwaysOpen: true,
    accountRows: accounts,
    categoryRows: [
      { categoryId: 1, name: 'Food' },
      { categoryId: 2, name: 'Household supplies' },
      { categoryId: 3, name: 'Shopping' },
    ],
    transferRows: [
      {
        transferId: 1,
        bookingDateEpochDay: 20747,
        name: 'Short categories',
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 2,
        categoryIds: [1],
        buyplace: null,
      },
      {
        transferId: 2,
        bookingDateEpochDay: 20747,
        name: 'Long categories',
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 2,
        categoryIds: [1, 2, 3],
        buyplace: null,
      },
    ],
  });
  await page.goto(appPath('#/transfers'));
  for (const width of [320, 390, 720]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of [1, 2]) {
      const card = page.getByTestId(`transfer-card-${id}`);
      await expect(card).toBeVisible();
      const geometry = await card.evaluate((element) => {
        const details = element.querySelector('.transfer-card__details')!.getBoundingClientRect();
        const categories = element
          .querySelector('.transfer-card__categories')!
          .getBoundingClientRect();
        const last = element
          .querySelector('.transfer-card__category:last-child')!
          .getBoundingClientRect();
        const accounts = element.querySelector('.transfer-card__accounts')!.getBoundingClientRect();
        return {
          edge: details.right - categories.right,
          last: details.right - last.right,
          wrapped: categories.top >= accounts.bottom,
        };
      });
      expect(Math.abs(geometry.edge)).toBeLessThan(2);
      expect(Math.abs(geometry.last)).toBeLessThan(2);
      if (width === 320 && id === 2) expect(geometry.wrapped).toBe(true);
      if (width === 720 && id === 1) expect(geometry.wrapped).toBe(false);
    }
  }
});

test('shows relevant transfer accounts and matches internal accents to neutral amounts', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  await installReadyAddTransferTestDb(page, {
    forceAlwaysOpen: true,
    accountRows: [
      ...accounts,
      { accountId: 4, name: 'Wallet', amountCents: 500, accountTypeId: 3 },
    ],
    transferRows: [
      {
        transferId: 1,
        bookingDateEpochDay: 20747,
        name: 'Income',
        amountCents: 500,
        fromAccountId: 1,
        toAccountId: 3,
        categoryIds: [],
        buyplace: null,
      },
      {
        transferId: 2,
        bookingDateEpochDay: 20747,
        name: 'Expense',
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 2,
        categoryIds: [],
        buyplace: null,
      },
      {
        transferId: 3,
        bookingDateEpochDay: 20747,
        name: 'Internal',
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 4,
        categoryIds: [],
        buyplace: null,
      },
    ],
  });
  await page.goto(appPath('#/transfers'));
  for (const id of [1, 2]) {
    const labels = page.getByTestId(`transfer-card-${id}`).locator('.transfer-card__accounts');
    await expect(labels.locator('.transfer-card__account')).toHaveText(['Checking account']);
    await expect(labels.locator('.transfer-card__account-arrow')).toHaveCount(0);
  }
  const internal = page.getByTestId('transfer-card-3');
  await expect(internal.locator('.transfer-card__account')).toHaveText([
    'Checking account',
    'Wallet',
  ]);
  await expect(internal.locator('.transfer-card__account-arrow')).toHaveText('→');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const colors = await internal.evaluate((element) => ({
      border: getComputedStyle(element).borderLeftColor,
      amount: getComputedStyle(element.querySelector('.transfer-card__amount')!).color,
    }));
    expect(colors.border).toBe(colors.amount);
    const incomeBorder = await page
      .getByTestId('transfer-card-1')
      .evaluate((element) => getComputedStyle(element).borderLeftColor);
    expect(colors.border).not.toBe(incomeBorder);
  }
});
