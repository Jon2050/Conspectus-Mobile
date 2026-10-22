// Verifies scrolling, compact persistent build metadata, and route changes across screen sizes.
import { expect, test } from '@playwright/test';
import {
  appPath,
  expandSettingsSections,
  installReadyAddTransferTestDb,
} from './support/app-test-harness';

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
]) {
  test(`keeps navigation and version visible at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: viewport.width === 390 ? 'dark' : 'light' });
    await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
    await installReadyAddTransferTestDb(page, {
      accountRows: [
        { accountId: 2, name: 'Spendings', amountCents: 0, accountTypeId: 2 },
        { accountId: 3, name: 'Checking', amountCents: 250000, accountTypeId: 3 },
      ],
      transferRows: Array.from({ length: 30 }, (_, index) => ({
        transferId: index + 1,
        bookingDateEpochDay: 20747,
        name: `Transfer ${index + 1}`,
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 2,
        categoryIds: [],
        buyplace: null,
      })),
    });
    await page.goto(appPath('#/settings'));
    await expandSettingsSections(page);
    const content = page.getByTestId('app-shell-content');
    const header = page.getByRole('heading', { level: 1 });
    const bottom = page.getByTestId('app-shell-bottom');
    const footer = page.getByTestId('deployment-info-footer');
    const nav = page.getByRole('navigation');
    const initialBottom = await bottom.boundingBox();
    const initialFooter = await footer.boundingBox();
    const navBounds = (await nav.boundingBox())!;
    expect(initialFooter!.y).toBeGreaterThanOrEqual(navBounds.y + navBounds.height);
    expect(initialFooter!.y - navBounds.y - navBounds.height).toBeLessThanOrEqual(3);
    expect(initialFooter!.height).toBeLessThanOrEqual(24);
    expect(viewport.height - initialFooter!.y - initialFooter!.height).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );

    const screenshot = async (name: string): Promise<void> => {
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: 10000 });
      const screenshotPath = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path: screenshotPath, scale: 'css' });
      await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' });
    };
    await content.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(header).toBeInViewport();
    await screenshot('settings-top');
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(header).not.toBeInViewport();
    await expect(footer).toBeInViewport();
    await expect(page.getByTestId('settings-build-information')).toBeInViewport();
    expect(await bottom.boundingBox()).toEqual(initialBottom);
    expect(await footer.boundingBox()).toEqual(initialFooter);
    await screenshot('settings-scrolled');

    await page.getByRole('link', { name: 'Transfers', exact: true }).click();
    await expect(page.getByTestId('transfer-card-30')).toHaveCount(1);
    await expect(header).toBeInViewport();
    expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(header).not.toBeInViewport();
    await expect(page.getByTestId('transfer-card-30')).toBeInViewport();
    expect(await bottom.boundingBox()).toEqual(initialBottom);
    await screenshot('transfers-scrolled');

    await page.getByRole('link', { name: 'Accounts', exact: true }).click();
    await expect(header).toBeInViewport();
    await expect(footer).toBeInViewport();
    expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(header).toBeInViewport();
    await expect(footer).toBeInViewport();
    expect(await bottom.boundingBox()).toEqual(initialBottom);
  });
}
