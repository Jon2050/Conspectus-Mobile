import { expect, test, type Page } from '@playwright/test';
import { appPath, installReadyAddTransferTestDb } from './support/app-test-harness';

const openSheet = async (page: Page, uploadDelayMs = 0) => {
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking '.repeat(12), amountCents: 10000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 12, name: 'Savings '.repeat(12), amountCents: 1000, accountTypeId: 3 },
      ],
      categoryRows: [{ categoryId: 20, name: 'Groceries '.repeat(12) }],
    },
    { uploadDelayMs },
  );
  await page.goto(appPath('#/add'));
  await expect(page.getByRole('dialog')).toBeVisible();
};

const dragGrip = async (page: Page, dy: number, dx = 0) => {
  const grip = await page.locator('.bottom-sheet__grip').boundingBox();
  expect(grip).not.toBeNull();
  const x = grip!.x + grip!.width / 2;
  const y = grip!.y + grip!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
};

for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 664 },
  { width: 720, height: 320 },
]) {
  test(`anchors the sheet and retains header focus at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openSheet(page);
    const sheet = page.getByRole('dialog');
    const content = page.locator('.bottom-sheet__content');
    await expect(page.locator('.bottom-sheet__header')).toBeFocused();
    expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
    const bounds = await sheet.boundingBox();
    expect(Math.abs(bounds!.y + bounds!.height - viewport.height)).toBeLessThan(2);
    const date = page.getByTestId('add-transfer-date');
    await expect(date).toBeEnabled();
    await expect(date).toHaveAttribute('type', 'date');
    expect((await date.boundingBox())!.height).toBeLessThanOrEqual(49);
    expect((await date.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await date.fill('2026-10-21');
    await expect(date).toHaveValue('2026-10-21');
    await expect(page.getByTestId('bottom-sheet-close')).toHaveCount(0);
    expect(
      await content.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    for (const control of await sheet.locator('.app-input').all()) {
      expect(
        await control.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const parent = element.closest('.bottom-sheet__content')!.getBoundingClientRect();
          return box.left >= parent.left - 1 && box.right <= parent.right + 1;
        }),
      ).toBe(true);
    }
    await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('add-transfer-submit')).toBeInViewport();
    await expect(page.getByTestId('bottom-sheet-close')).toHaveCount(0);
    await page.getByTestId('add-transfer-close').click();
    await expect(sheet).toHaveCount(0);
  });
}

test('separates deliberate grip dismissal from small movements, cancellation and form scrolling, preserving drafts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSheet(page);
  await page.getByTestId('add-transfer-name').fill('Retained draft');
  const content = page.locator('.bottom-sheet__content');
  await content.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByTestId('add-transfer-submit')).toBeInViewport();
  await expect(page.getByRole('dialog')).toBeVisible();
  await dragGrip(page, 25);
  await expect(page.getByRole('dialog')).toBeVisible();
  await dragGrip(page, 85, 130);
  await expect(page.getByRole('dialog')).toBeVisible();
  const grip = page.locator('.bottom-sheet__grip');
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 110);
  await grip.dispatchEvent('pointercancel');
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await dragGrip(page, 100);
  await expect(page).toHaveURL(/#\/transfers$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Retained draft');
  expect(await content.evaluate((element) => element.scrollTop)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('blocks every dismissal path during upload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSheet(page, 2500);
  await page.getByTestId('add-transfer-name').fill('Locked upload');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await page.getByTestId('add-transfer-to-account').selectOption('12');
  await page.getByTestId('add-transfer-submit').click();
  await expect(page.getByTestId('add-transfer-upload-status')).toBeVisible();
  await expect(page.getByTestId('bottom-sheet-close')).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-close')).toBeDisabled();
  await page.keyboard.press('Escape');
  await dragGrip(page, 100);
  await page.mouse.click(1, 1);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('add-transfer-success-status')).toBeVisible();
  await page.getByTestId('add-transfer-close').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('uses system fonts without requests and supports larger text and viewport rotation', async ({
  page,
}) => {
  const fontRequests: string[] = [];
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    fontRequests.push(route.request().url());
    await route.abort();
  });
  await page.setViewportSize({ width: 320, height: 720 });
  await openSheet(page);
  await expect(page.locator('.receipt-capture-details')).not.toHaveAttribute('open');
  await page.locator('.receipt-capture-details summary').click();
  await expect(page.getByTestId('receipt-semantic-risk')).toBeVisible();
  await page.addStyleTag({ content: ':root { font-size: 24px; }' });
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 720, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId('bottom-sheet-close')).toHaveCount(0);
    await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('add-transfer-submit')).toBeInViewport();
    expect(
      await page
        .locator('.bottom-sheet__content')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  }
  await page.getByTestId('add-transfer-close').click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
  expect(
    await page.locator('body').evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('system-ui');
  expect(fontRequests).toEqual([]);
});

test('dismisses through a real touch pointer on the grip and keeps touch scrolling inside the form', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Touch injection uses Chromium CDP; physical iOS remains a separate gate.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await openSheet(page);
  const session = await page.context().newCDPSession(page);
  const swipe = async (x: number, y: number, dy: number) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (dy * step) / 8 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const content = page.locator('.bottom-sheet__content');
  const box = (await content.boundingBox())!;
  await swipe(box.x + box.width / 2, box.y + box.height * 0.75, -140);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const grip = (await page.locator('.bottom-sheet__grip').boundingBox())!;
  await swipe(grip.x + grip.width / 2, grip.y + grip.height / 2, 100);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await session.detach();
});
