import { expect, test } from '@playwright/test';

test('loads the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Vite + Svelte' })).toBeVisible();
  await expect(page.locator('#app')).toBeVisible();
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
