import { defineConfig, devices } from '@playwright/test';

const resolveAppBasePath = (): string => {
  const configuredBasePath = process.env.PLAYWRIGHT_APP_BASE_PATH?.trim();
  if (!configuredBasePath) {
    return '/conspectus/';
  }

  const withLeadingSlash = configuredBasePath.startsWith('/')
    ? configuredBasePath
    : `/${configuredBasePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const appBasePath = resolveAppBasePath();
const webServerUrl = new URL(appBasePath, 'http://127.0.0.1:4173').toString();

const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_BUILD === '0'
    ? 'node scripts/serve-static-dist.mjs'
    : 'npm run build && node scripts/serve-static-dist.mjs';
const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'pixel-5',
    use: { ...devices['Pixel 5'] },
  },
  {
    name: 'iphone-13-safari',
    use: { ...devices['iPhone 13'] },
  },
];

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // PWA update tests mutate the served dist. Parallelize in isolated CI shards,
  // not with multiple workers sharing that directory. The WebKit-only command
  // can use two workers because the mutating tests are Chromium-only.
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'reports/playwright/junit.xml' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: process.env.CI ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects,
  webServer: {
    command: webServerCommand,
    env: {
      ...process.env,
      DEPLOY_CHANNEL: 'production',
      PLAYWRIGHT_APP_BASE_PATH: appBasePath,
      PLAYWRIGHT_WEB_SERVER_HOST: '127.0.0.1',
      PLAYWRIGHT_WEB_SERVER_PORT: '4173',
      VITE_AZURE_CLIENT_ID: process.env.VITE_AZURE_CLIENT_ID ?? 'playwright-test-client-id',
    },
    url: webServerUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
