// Verifies the browser-visible native receipt capture boundary without simulating OS camera UI.
import { expect, test } from '@playwright/test';

import { appPath, installReadyAddTransferTestDb } from './support/app-test-harness';

test.use({ viewport: { width: 320, height: 720 } });

test('exposes one native outward-camera image input without custom capture or gallery UI', async ({
  page,
}) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
  });

  await page.goto(appPath('#/add'));

  const photoButton = page.getByTestId('receipt-photo-button');
  const nativeInput = page.getByTestId('receipt-image-input');
  await expect(photoButton).toBeVisible();
  await expect(photoButton).toHaveAccessibleName('Photograph receipt');
  await expect(nativeInput).toHaveAttribute('type', 'file');
  await expect(nativeInput).toHaveAttribute('accept', 'image/*');
  await expect(nativeInput).toHaveAttribute('capture', 'environment');
  await expect(nativeInput).not.toHaveAttribute('multiple', '');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('[data-testid*="gallery"]')).toHaveCount(0);
  await expect(page.locator('[data-testid*="receipt-preview"]')).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  const captureSectionSize = await page
    .locator('.add-transfer-form__receipt')
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  expect(captureSectionSize.clientWidth).toBeGreaterThan(0);
  expect(captureSectionSize.scrollWidth).toBeLessThanOrEqual(captureSectionSize.clientWidth);
});
