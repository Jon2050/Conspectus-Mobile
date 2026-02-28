import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('loads a mobile app shell and navigates placeholder routes', async ({ page }) => {
  await page.goto('/#/accounts');

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page).toHaveURL(/#\/transfers$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();

  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page).toHaveURL(/#\/add$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Add' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
});

test('keeps hash route stable across direct loads and reloads', async ({ page }) => {
  const initialResponse = await page.goto('/#/transfers');
  expect(initialResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();

  const reloadResponse = await page.reload();
  expect(reloadResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();
});

test('does not trap browser back navigation from fallback hash route', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page).toHaveURL(/#\/transfers$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('falls back safely on invalid hash routes', async ({ page }) => {
  const initialResponse = await page.goto('/#/unknown');
  expect(initialResponse?.status()).toBe(200);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('exposes manifest and registers service worker', async ({ page }) => {
  await page.goto('/');

  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = (await manifestResponse.json()) as {
    name?: string;
    display?: string;
    icons?: Array<{ src?: string }>;
  };

  expect(manifest.name).toBe('Conspectus Mobile');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons?.length).toBeGreaterThan(0);

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) {
            return false;
          }

          const registration = await navigator.serviceWorker.getRegistration();
          return Boolean(registration?.active);
        }),
      { timeout: 15_000 },
    )
    .toBeTruthy();
});
