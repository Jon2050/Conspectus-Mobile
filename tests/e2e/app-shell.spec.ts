import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const APP_BASE_PATH = '/conspectus/webapp/';
const APP_BASE_PATH_WITHOUT_TRAILING_SLASH = APP_BASE_PATH.slice(0, -1);
const PLAYWRIGHT_TEST_CLIENT_ID = 'playwright-test-client-id';
const RUNTIME_CLIENT_ID_TOKENS = [
  process.env.VITE_AZURE_CLIENT_ID,
  PLAYWRIGHT_TEST_CLIENT_ID,
].filter(
  (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
);
const appPath = (suffix = ''): string => `${APP_BASE_PATH}${suffix}`;
const REQUIRED_MANIFEST_ICONS = [
  {
    src: 'icons/moneysack192x192.png',
    sizes: '192x192',
  },
  {
    src: 'icons/moneysack512x512.png',
    sizes: '512x512',
  },
];

type MockAuthClientOptions = {
  readonly initializeDelayMs?: number;
  readonly signInDelayMs?: number;
  readonly signOutDelayMs?: number;
  readonly failInitialize?: boolean;
  readonly failSignIn?: boolean;
  readonly failSignOut?: boolean;
  readonly startAuthenticated?: boolean;
};

const installMockAuthClient = async (
  page: import('@playwright/test').Page,
  options: MockAuthClientOptions = {},
): Promise<void> => {
  await page.addInitScript((mockOptions: MockAuthClientOptions) => {
    const resolveDelay = (delayMs: number | undefined): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs ?? 0);
      });

    const account = {
      homeAccountId: 'mock-home-account',
      username: 'mock-user@example.com',
      displayName: 'Mock User',
    };

    let isInitialized = false;
    let isAuthenticated = mockOptions.startAuthenticated ?? false;

    const toSession = () => ({
      isAuthenticated,
      account: isAuthenticated ? account : null,
    });

    (window as Window & { __CONSPECTUS_AUTH_CLIENT__?: unknown }).__CONSPECTUS_AUTH_CLIENT__ = {
      async initialize() {
        await resolveDelay(mockOptions.initializeDelayMs);
        if (mockOptions.failInitialize) {
          throw {
            code: 'network_error',
            message: 'Mock initialize failure.',
          };
        }
        isInitialized = true;
      },
      getSession() {
        if (!isInitialized) {
          return {
            isAuthenticated: false,
            account: null,
          };
        }

        return toSession();
      },
      async signIn() {
        await resolveDelay(mockOptions.signInDelayMs);
        if (mockOptions.failSignIn) {
          throw {
            code: 'network_error',
            message: 'Mock sign-in failure.',
          };
        }
        isAuthenticated = true;
      },
      async signOut() {
        await resolveDelay(mockOptions.signOutDelayMs);
        if (mockOptions.failSignOut) {
          throw {
            code: 'network_error',
            message: 'Mock sign-out failure.',
          };
        }
        isAuthenticated = false;
      },
      async getAccessToken() {
        return 'mock-access-token';
      },
    };
  }, options);
};

test('shows startup configuration error when required runtime env is missing', async ({ page }) => {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();

    const tokenToReplace = RUNTIME_CLIENT_ID_TOKENS.find((token) => body.includes(token));
    if (!tokenToReplace) {
      await route.fulfill({ response, body });
      return;
    }

    await route.fulfill({
      response,
      body: body.split(tokenToReplace).join('   '),
    });
  });

  await page.goto(appPath());

  await expect(
    page.getByRole('heading', { level: 1, name: 'Startup configuration error' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Missing required environment variable(s): VITE_AZURE_CLIENT_ID.',
  );
  await expect(page.getByTestId('app-shell')).toHaveCount(0);
});

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

test('supports sign-in and sign-out auth UX states in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    signInDelayMs: 250,
    signOutDelayMs: 250,
  });

  await page.goto(appPath('#/settings'));

  const statusMessage = page.getByTestId('auth-status-message');
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(statusMessage).toContainText('Signed out.');

  const signInButton = page.getByRole('button', { name: 'Sign in with Microsoft' });
  await signInButton.click();

  await expect(statusMessage).toContainText('Opening Microsoft sign-in...');
  await expect(signInButton).toBeDisabled();
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByText('mock-user@example.com')).toBeVisible();
  await expect(statusMessage).toContainText('Signed in.');

  const signOutButton = page.getByRole('button', { name: 'Sign out' });
  await signOutButton.click();

  await expect(statusMessage).toContainText('Signing out...');
  await expect(signOutButton).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(statusMessage).toContainText('Signed out.');
});

test('shows auth error UI when sign-in fails in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    failSignIn: true,
  });

  await page.goto(appPath('#/settings'));

  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByRole('alert')).toContainText('Mock sign-in failure.');
  await expect(page.getByTestId('auth-status-message')).toContainText(
    'Authentication error. Mock sign-in failure.',
  );
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
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
    icons?: Array<{ src?: string; sizes?: string }>;
  };

  expect(manifest.name).toBe('Conspectus Mobile');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe(APP_BASE_PATH);
  expect(manifest.scope).toBe(APP_BASE_PATH);

  const manifestIcons = manifest.icons ?? [];
  expect(manifestIcons.length).toBeGreaterThan(0);

  for (const expectedIcon of REQUIRED_MANIFEST_ICONS) {
    expect(manifestIcons).toContainEqual(
      expect.objectContaining({
        src: expectedIcon.src,
        sizes: expectedIcon.sizes,
      }),
    );

    const iconResponse = await page.request.get(appPath(expectedIcon.src));
    expect(iconResponse.ok()).toBeTruthy();
  }

  const appleTouchIconHref = await page
    .locator('link[rel="apple-touch-icon"]')
    .first()
    .getAttribute('href');
  expect(appleTouchIconHref).toBe(appPath('icons/moneysack180x180.png'));

  const appleTouchIconResponse = await page.request.get(appPath('icons/moneysack180x180.png'));
  expect(appleTouchIconResponse.ok()).toBeTruthy();

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
