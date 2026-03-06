import { defineConfig, devices } from '@playwright/test';

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

const appBasePath = resolveAppBasePath();
const webServerUrl = new URL(appBasePath, 'http://127.0.0.1:4173').toString();

const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_BUILD === '0'
    ? 'node scripts/serve-static-dist.mjs'
    : 'npm run build && npm run preview -- --host=127.0.0.1 --port=4173 --strictPort';
const includeIosWebkitProject = process.env.PLAYWRIGHT_INCLUDE_IOS_WEBKIT === '1';

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'pixel-5',
    use: { ...devices['Pixel 5'] },
  },
];

if (includeIosWebkitProject) {
  projects.push({
    name: 'iphone-13-safari',
    use: { ...devices['iPhone 13'] },
  });
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'reports/playwright/junit.xml' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects,
  webServer: {
    command: webServerCommand,
    env: {
      ...process.env,
      DEPLOY_CHANNEL: 'production',
      PLAYWRIGHT_WEB_SERVER_HOST: '127.0.0.1',
      PLAYWRIGHT_WEB_SERVER_PORT: '4173',
      VITE_AZURE_CLIENT_ID: process.env.VITE_AZURE_CLIENT_ID ?? 'playwright-test-client-id',
    },
    url: webServerUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
