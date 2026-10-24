import { expect, test, type Page } from '@playwright/test';
import {
  appPath,
  dispatchTransferMonthSwipe,
  installReadyAddTransferTestDb,
} from './support/app-test-harness';

test.use({ locale: 'de-DE' });

test('toggles transfer ordering, replaces the brief hint and remembers the choice after reopening', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
  const installTestDb = (target: Page): Promise<void> =>
    installReadyAddTransferTestDb(target, {
      forceAlwaysOpen: true,
      accountRows: [
        { accountId: 2, name: 'Ausgaben', amountCents: 0, accountTypeId: 2 },
        { accountId: 3, name: 'Girokonto', amountCents: 250000, accountTypeId: 3 },
      ],
      categoryRows: [{ categoryId: 1, name: 'Lebensmittel' }],
      transferRows: [
        {
          transferId: 2,
          bookingDateEpochDay: 20747,
          name: 'Wocheneinkauf',
          amountCents: 4265,
          fromAccountId: 3,
          toAccountId: 2,
          categoryIds: [1],
          buyplace: 'REWE',
        },
        {
          transferId: 3,
          bookingDateEpochDay: 20747,
          name: 'Kaffee',
          amountCents: 350,
          fromAccountId: 3,
          toAccountId: 2,
          categoryIds: [],
          buyplace: 'Café',
        },
        {
          transferId: 1,
          bookingDateEpochDay: 20729,
          name: 'Monatskarte',
          amountCents: 5800,
          fromAccountId: 3,
          toAccountId: 2,
          categoryIds: [],
          buyplace: 'Bahn',
        },
        {
          transferId: 4,
          bookingDateEpochDay: 20722,
          name: 'September',
          amountCents: 1000,
          fromAccountId: 3,
          toAccountId: 2,
          categoryIds: [],
          buyplace: null,
        },
        {
          transferId: 5,
          bookingDateEpochDay: 20721,
          name: 'September alt',
          amountCents: 1000,
          fromAccountId: 3,
          toAccountId: 2,
          categoryIds: [],
          buyplace: null,
        },
      ],
    });
  await installTestDb(page);
  await page.goto(appPath('#/transfers'));
  const cards = page.locator('[data-transfer-id]');
  const button = page.getByTestId('transfers-sort-button');
  const ids = () =>
    cards.evaluateAll((elements) => elements.map((el) => el.getAttribute('data-transfer-id')));
  await expect(cards).toHaveCount(3);
  expect(await ids()).toEqual(['1', '2', '3']);
  await expect(page.locator('.toast')).toHaveCount(0);
  await button.click();
  expect(await ids()).toEqual(['3', '2', '1']);
  await expect(page.locator('.toast')).toHaveText('Neueste oben');
  await expect(button).toHaveAttribute(
    'aria-label',
    'Sortierung: Neueste oben. Reihenfolge umkehren',
  );
  await page.screenshot({
    path: testInfo.outputPath('transfers-newest-first.png'),
    animations: 'disabled',
  });
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 3500 });
  await button.click();
  await button.click();
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toHaveText('Neueste oben');
  await page.reload();
  await expect(cards).toHaveCount(3);
  expect(await ids()).toEqual(['3', '2', '1']);
  await expect(page.locator('.toast')).toHaveCount(0);
  await dispatchTransferMonthSwipe(page, 140);
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    '2026-09',
  );
  await expect(cards).toHaveCount(2);
  expect(await ids()).toEqual(['4', '5']);
  await page.getByRole('link', { name: 'Konten', exact: true }).click();
  await page.getByRole('link', { name: 'Transfers', exact: true }).click();
  await expect(cards).toHaveCount(3);
  expect(await ids()).toEqual(['3', '2', '1']);
  await button.click();
  expect(await ids()).toEqual(['1', '2', '3']);
  await expect(page.locator('.toast')).toHaveText('Älteste oben');
  await page.screenshot({
    path: testInfo.outputPath('transfers-oldest-first.png'),
    animations: 'disabled',
  });

  // A new page restores the preference from the shared persistent browser storage.
  const reopened = await context.newPage();
  await reopened.clock.setFixedTime(new Date('2026-10-24T12:00:00Z'));
  await installTestDb(reopened);
  await page.close();
  await reopened.goto(appPath('#/transfers'));
  await expect(reopened.locator('[data-transfer-id]')).toHaveCount(3);
  await expect(reopened.locator('[data-transfer-id]').first()).toHaveAttribute(
    'data-transfer-id',
    '1',
  );
  await expect(reopened.getByTestId('transfers-sort-button')).toHaveAttribute(
    'aria-label',
    'Sortierung: Älteste oben. Reihenfolge umkehren',
  );
});
