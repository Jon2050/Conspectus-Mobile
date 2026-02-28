import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const APP_BASE_PATH = '/conspectus/webapp/';
const APP_BASE_PATH_WITHOUT_TRAILING_SLASH = APP_BASE_PATH.slice(0, -1);
const appPath = (suffix = ''): string => `${APP_BASE_PATH}${suffix}`;

test('loads a mobile app shell and navigates placeholder routes', async ({ page }) => {
  await page.goto(appPath('#/accounts'));

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

test('exposes manifest and registers service worker', async ({ page }) => {
  await page.goto(appPath());

  const manifestResponse = await page.request.get(appPath('manifest.webmanifest'));
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = (await manifestResponse.json()) as {
    name?: string;
    display?: string;
    start_url?: string;
    scope?: string;
    icons?: Array<{ src?: string }>;
  };

  expect(manifest.name).toBe('Conspectus Mobile');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe(APP_BASE_PATH);
  expect(manifest.scope).toBe(APP_BASE_PATH);
  expect(manifest.icons?.length).toBeGreaterThan(0);

  const expectedServiceWorkerScope = new URL(APP_BASE_PATH, page.url()).toString();

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) {
            return '';
          }

          const registration = await navigator.serviceWorker.getRegistration('/conspectus/webapp/');
          if (!registration?.active) {
            return '';
          }

          return registration.scope;
        }),
      { timeout: 15_000 },
    )
    .toBe(expectedServiceWorkerScope);
});

test('does not register service worker for parent-site routes outside the app base path', async ({
  page,
}) => {
  await page.goto(appPath('#/accounts'));
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) {
            return false;
          }

          const registration = await navigator.serviceWorker.getRegistration('/conspectus/webapp/');
          return Boolean(registration?.active);
        }),
      { timeout: 15_000 },
    )
    .toBeTruthy();

  const parentRouteRegistrationScope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration?.scope ?? null;
  });

  expect(parentRouteRegistrationScope).toBeNull();

  const registrationScope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/conspectus/webapp/');
    return registration?.scope ?? '';
  });

  expect(registrationScope).toContain(`${APP_BASE_PATH_WITHOUT_TRAILING_SLASH}/`);
});
