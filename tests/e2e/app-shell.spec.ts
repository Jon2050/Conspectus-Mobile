import { expect, test } from '@playwright/test';

test('loads the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Vite + Svelte' })).toBeVisible();
  await expect(page.locator('#app')).toBeVisible();
});
