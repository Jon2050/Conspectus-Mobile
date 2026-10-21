import { expect, test, type Page } from '@playwright/test';

import {
  appPath,
  expandSettingsSections,
  installReadyAddTransferTestDb,
} from './support/app-test-harness';
import { installOpenRouterBenchmarkFixture } from './support/openrouter-benchmarks';

test.use({ locale: 'de-DE' });

const expectContentToFit = async (
  page: Page,
  content = page.getByTestId('app-shell-content'),
): Promise<void> => {
  const geometry = await content.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: bounds.left,
      right: bounds.right,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  for (const offset of [-1000, 1000]) {
    await content.evaluate((element, left) => {
      element.scrollLeft = left;
    }, offset);
    expect(await content.evaluate((element) => element.scrollLeft)).toBe(0);
  }
};

for (const width of [320, 390, 430]) {
  test(`keeps expanded settings and other routes within a ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await installReadyAddTransferTestDb(page);
    await installOpenRouterBenchmarkFixture(page);
    await page.route('https://openrouter.ai/api/v1/models/user', (route) =>
      route.fulfill({
        json: {
          data: [
            {
              id: 'provider/shared:free',
              canonical_slug: 'provider/shared-snapshot',
              name: 'A very long model display name that must never widen the settings screen',
              architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
              pricing: { prompt: '0', completion: '0' },
              supported_parameters: [],
            },
          ],
        },
      }),
    );
    await page.goto(appPath('#/settings'));
    await expandSettingsSections(page);
    await expectContentToFit(page);

    await page.getByTestId('openrouter-api-key-input').fill('sk-or-layout-test');
    await page.getByTestId('openrouter-save-key-button').click();
    await expect(page.getByTestId('openrouter-key-configured')).toBeVisible();
    await page.getByTestId('openrouter-vision-model').selectOption('provider/shared:free');
    await page.getByTestId('openrouter-transfer-model').selectOption('provider/shared:free');
    await expectContentToFit(page);

    for (const testId of [
      'openrouter-api-key-input',
      'openrouter-vision-model',
      'openrouter-transfer-model',
      'openrouter-transfer-prompt',
    ]) {
      const control = page.getByTestId(testId);
      await control.scrollIntoViewIfNeeded();
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }

    const content = page.getByTestId('app-shell-content');
    await content.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByTestId('openrouter-transfer-prompt').scrollIntoViewIfNeeded();
    expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    for (const route of ['accounts', 'transfers']) {
      await page
        .getByRole('link', {
          name: route === 'accounts' ? 'Konten' : 'Transfers',
          exact: true,
        })
        .click();
      await expect(page.getByTestId(`route-${route}`)).toBeVisible();
      await expectContentToFit(page);
    }

    await page.getByRole('link', { name: 'Neu', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    expect(
      await sheet.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await expectContentToFit(page, sheet.locator('.bottom-sheet__content'));
    await expectContentToFit(page);
  });
}

test('shows only the boxed message for an empty transfer month', async ({ page }) => {
  await installReadyAddTransferTestDb(page, { transferRows: [] });
  await page.goto(appPath('#/transfers'));
  await expect(page.getByTestId('transfers-route-empty')).toHaveText(
    'Es gibt keine Transfers für diesen Monat.',
  );
  await expect(page.getByTestId('transfers-route-status')).toHaveCount(0);
});
