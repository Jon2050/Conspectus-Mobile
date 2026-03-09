// Covers the app-shell navigation, auth mock flow, and OneDrive file selection behavior in a browser.
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const resolveAppBasePath = (): string => {
  const configuredBasePath = process.env.PLAYWRIGHT_APP_BASE_PATH?.trim();
  if (!configuredBasePath) {
    return '/conspectus/webapp/';
  }

  const withLeadingSlash = configuredBasePath.startsWith('/')
    ? configuredBasePath
    : `/${configuredBasePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const APP_BASE_PATH = resolveAppBasePath();
const APP_BASE_PATH_WITHOUT_TRAILING_SLASH = APP_BASE_PATH.slice(0, -1);
const RUNTIME_CLIENT_ID_PATTERN = /VITE_AZURE_CLIENT_ID:"[^"]*"/g;
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
  readonly consumeRedirectHashOnInitialize?: boolean;
  readonly failInitialize?: boolean;
  readonly failSignIn?: boolean;
  readonly failSignOut?: boolean;
  readonly startAuthenticated?: boolean;
};

type MockGraphClientOptions = {
  readonly failListChildren?: boolean;
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

        if (mockOptions.consumeRedirectHashOnInitialize) {
          const hasRedirectAuthHash =
            window.location.hash.includes('code=') && window.location.hash.includes('state=');
          if (hasRedirectAuthHash) {
            isAuthenticated = true;
          }
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

const installMockGraphClient = async (
  page: import('@playwright/test').Page,
  options: MockGraphClientOptions = {},
): Promise<void> => {
  await page.addInitScript((mockOptions: MockGraphClientOptions) => {
    const rootItems = [
      {
        driveId: 'drive-123',
        itemId: 'folder-finance',
        name: 'Finance',
        parentPath: '/',
        kind: 'folder',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-root-db',
        name: 'conspectus.db',
        parentPath: '/',
        kind: 'file',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-root-text',
        name: 'notes.txt',
        parentPath: '/',
        kind: 'file',
      },
    ];

    const financeItems = [
      {
        driveId: 'drive-123',
        itemId: 'file-finance-db',
        name: 'budget.db',
        parentPath: '/Finance',
        kind: 'file',
      },
    ];

    (window as Window & { __CONSPECTUS_GRAPH_CLIENT__?: unknown }).__CONSPECTUS_GRAPH_CLIENT__ = {
      async listChildren(folder?: { itemId?: string }) {
        if (mockOptions.failListChildren) {
          throw {
            code: 'network_error',
            message: 'Mock OneDrive browse failure.',
          };
        }

        if (folder?.itemId === 'folder-finance') {
          return financeItems;
        }

        return rootItems;
      },
      async getFileMetadata() {
        return {
          eTag: '"etag-1"',
          sizeBytes: 2048,
          lastModifiedDateTime: '2026-03-09T10:15:00Z',
        };
      },
      async downloadFile() {
        return new Uint8Array([1, 2, 3]);
      },
      async uploadFile() {
        return {
          eTag: '"etag-2"',
          sizeBytes: 2048,
          lastModifiedDateTime: '2026-03-09T11:15:00Z',
        };
      },
    };
  }, options);
};

test('shows startup configuration error when required runtime env is missing', async ({ page }) => {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();

    const rewrittenBody = body.replace(RUNTIME_CLIENT_ID_PATTERN, 'VITE_AZURE_CLIENT_ID:"   "');
    if (rewrittenBody === body) {
      await route.fulfill({ response, body });
      return;
    }

    await route.fulfill({
      response,
      body: rewrittenBody,
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

test('allows selecting a OneDrive .db file from the settings browser', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );

  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByText('Finance')).toBeVisible();
  await expect(page.getByText('conspectus.db')).toBeVisible();
  await expect(page.getByText('notes.txt')).toHaveCount(0);

  await page.getByTestId('open-folder-folder-finance').click();
  await expect(page.getByText('/Finance')).toBeVisible();
  await expect(page.getByText('budget.db')).toBeVisible();

  await page.getByTestId('select-file-file-finance-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/Finance');

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');
});

test('keeps the selected DB file after reload', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);

  await page.reload();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
});

test('shows browse errors without pretending the OneDrive folder is empty', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    failListChildren: true,
  });

  await page.goto(appPath('#/settings'));

  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByRole('alert')).toContainText('Mock OneDrive browse failure.');
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Mock OneDrive browse failure.',
  );
  await expect(page.getByText('No folders or .db files found here.')).toHaveCount(0);
});

test('processes redirect auth hash before route navigation and keeps signed-in status', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    consumeRedirectHashOnInitialize: true,
  });

  await page.goto(appPath('#code=mock-auth-code&state=mock-auth-state'));

  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
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
        page.evaluate(async (appBasePath) => {
          if (!('serviceWorker' in navigator)) {
            return '';
          }

          const registration = await navigator.serviceWorker.getRegistration(appBasePath);
          if (!registration?.active) {
            return '';
          }

          return registration.scope;
        }, APP_BASE_PATH),
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
        page.evaluate(async (appBasePath) => {
          if (!('serviceWorker' in navigator)) {
            return false;
          }

          const registration = await navigator.serviceWorker.getRegistration(appBasePath);
          return Boolean(registration?.active);
        }, APP_BASE_PATH),
      { timeout: 15_000 },
    )
    .toBeTruthy();

  const parentRouteRegistrationScope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration?.scope ?? null;
  });

  expect(parentRouteRegistrationScope).toBeNull();

  const appRegistrationScope = await page.evaluate(async (appBasePath) => {
    const registration = await navigator.serviceWorker.getRegistration(appBasePath);
    return registration?.scope ?? '';
  }, APP_BASE_PATH);

  expect(appRegistrationScope).toContain(`${APP_BASE_PATH_WITHOUT_TRAILING_SLASH}/`);
});
