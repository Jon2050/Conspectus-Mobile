// Covers live OpenRouter Settings validation, reconciliation, privacy, and account isolation.
import { expect, test, type Page, type Request } from '@playwright/test';

import { appPath, installMockAuthClient } from './support/app-test-harness';

test.use({ viewport: { width: 390, height: 844 } });

interface CatalogReply {
  readonly status: number;
  readonly data?: readonly Record<string, unknown>[];
}

interface CatalogRouteCapture {
  readonly requests: Request[];
}

const sharedModel = {
  id: 'provider/shared:free',
  name: 'Shared Free Model',
  architecture: {
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
  },
  pricing: { prompt: '0', completion: '0' },
  supported_parameters: ['structured_outputs'],
};

const transferOnlyModel = {
  id: 'provider/text:free',
  name: 'Text Free Model',
  architecture: {
    input_modalities: ['text'],
    output_modalities: ['text'],
  },
  pricing: { prompt: '0', completion: '0', request: '0' },
  supported_parameters: ['structured_outputs'],
};

const sharedTransferOnlyModel = {
  ...transferOnlyModel,
  id: 'provider/shared:free',
  name: 'Shared Free Model',
};

const visionOnlyModel = {
  id: 'provider/vision:free',
  name: 'Vision Free Model',
  architecture: {
    input_modalities: ['image'],
    output_modalities: ['text'],
  },
  pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
  supported_parameters: [],
};

const installCatalogRoute = async (
  page: Page,
  replies: readonly CatalogReply[],
): Promise<CatalogRouteCapture> => {
  const requests: Request[] = [];
  let responseIndex = 0;

  await page.route('https://openrouter.ai/api/v1/models/user', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization,content-type',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
        },
      });
      return;
    }

    requests.push(request);
    const reply = replies[Math.min(responseIndex, replies.length - 1)] ?? { status: 500 };
    responseIndex += 1;
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(reply.status === 200 ? { data: reply.data ?? [] } : { error: 'failed' }),
    });
  });

  return { requests };
};

const openAuthenticatedSettings = async (page: Page): Promise<void> => {
  await installMockAuthClient(page, { startAuthenticated: true });
  await page.goto(appPath('#/settings'));
  await expect(page.getByTestId('openrouter-settings')).toBeVisible();
};

test('validates a write-only key and configures both receipt roles from the live catalog', async ({
  page,
}) => {
  const apiKey = 'sk-or-test-browser-secret';
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  const capture = await installCatalogRoute(page, [{ status: 200, data: [sharedModel] }]);
  await openAuthenticatedSettings(page);

  const visionSelect = page.getByTestId('openrouter-vision-model');
  const transferSelect = page.getByTestId('openrouter-transfer-model');
  await expect(visionSelect).toBeDisabled();
  await expect(transferSelect).toBeDisabled();
  await expect(visionSelect.locator('option')).toHaveCount(1);
  await expect(page.getByTestId('openrouter-transfer-prompt-field')).toHaveCount(0);
  await expect(page.getByTestId('openrouter-privacy-disclosure')).toContainText(
    'Stage 1 sends the receipt image',
  );
  await expect(page.getByTestId('openrouter-privacy-disclosure')).toContainText(
    'does not force Zero Data Retention',
  );

  await page.getByTestId('openrouter-api-key-input').fill(apiKey);
  await page.getByTestId('openrouter-save-key-button').click();

  await expect(page.getByTestId('openrouter-key-configured')).toBeVisible();
  await expect(page.getByTestId('openrouter-api-key-input')).toHaveValue('');
  await expect(visionSelect).toBeEnabled();
  await expect(transferSelect).toBeEnabled();
  await expect(visionSelect.locator('option')).toContainText([
    'Select a compatible free model',
    'Shared Free Model — provider/shared:free',
  ]);
  await expect(page.getByTestId('openrouter-transfer-prompt')).toHaveValue(
    /VORLÄUFIGE TRANSFERGRUPPEN/u,
  );

  await visionSelect.selectOption('provider/shared:free');
  await transferSelect.selectOption('provider/shared:free');
  await expect(page.getByTestId('openrouter-configuration-status')).toContainText(
    'configuration is ready',
  );

  const prompt = page.getByTestId('openrouter-transfer-prompt');
  await prompt.fill('Custom group and category rules');
  await page.getByTestId('openrouter-reset-prompt-button').click();
  await expect(prompt).toHaveValue(/VORLÄUFIGE TRANSFERGRUPPEN/u);

  expect(capture.requests).toHaveLength(1);
  const catalogRequest = capture.requests[0];
  expect(catalogRequest?.method()).toBe('GET');
  expect(catalogRequest?.url()).toBe('https://openrouter.ai/api/v1/models/user');
  expect(catalogRequest?.headers().authorization).toBe(`Bearer ${apiKey}`);
  expect(catalogRequest?.postData()).toBeNull();
  expect(page.url()).not.toContain(apiKey);
  expect(await page.locator('body').innerText()).not.toContain(apiKey);
  expect(consoleMessages.join('\n')).not.toContain(apiKey);
});

test('keeps model and prompt controls unavailable when OpenRouter rejects the key', async ({
  page,
}) => {
  const apiKey = 'sk-or-test-invalid-secret';
  const capture = await installCatalogRoute(page, [{ status: 401 }]);
  await openAuthenticatedSettings(page);

  await page.getByTestId('openrouter-api-key-input').fill(apiKey);
  await page.getByTestId('openrouter-save-key-button').click();

  await expect(page.getByRole('alert')).toContainText('OpenRouter rejected this API key');
  await expect(page.getByTestId('openrouter-vision-model')).toBeDisabled();
  await expect(page.getByTestId('openrouter-transfer-model')).toBeDisabled();
  await expect(page.getByTestId('openrouter-transfer-prompt-field')).toHaveCount(0);
  await expect(page.getByTestId('openrouter-key-configured')).toHaveCount(0);
  expect(capture.requests).toHaveLength(1);
  expect(
    await page.evaluate(() => localStorage.getItem('conspectus.openRouterReceiptSettings')),
  ).toBeNull();
  expect(await page.locator('body').innerText()).not.toContain(apiKey);
});

test('shows accessible role-specific empty states for a valid key with no free candidates', async ({
  page,
}) => {
  await installCatalogRoute(page, [{ status: 200, data: [] }]);
  await openAuthenticatedSettings(page);

  await page.getByTestId('openrouter-api-key-input').fill('sk-or-test-empty-catalog');
  await page.getByTestId('openrouter-save-key-button').click();

  await expect(page.getByTestId('openrouter-key-configured')).toBeVisible();
  await expect(page.getByText(/No current free image-input/u)).toBeVisible();
  await expect(page.getByText(/No current free text model/u)).toBeVisible();
  await expect(page.getByTestId('openrouter-vision-model')).toBeDisabled();
  await expect(page.getByTestId('openrouter-transfer-model')).toBeDisabled();
  await expect(page.getByTestId('openrouter-transfer-prompt-field')).toBeVisible();
  await expect(page.getByTestId('openrouter-configuration-status')).toContainText('not ready');
});

test('refreshes on every Settings entry, retains IDs on transient failure, and clears invalid IDs after retry', async ({
  page,
}) => {
  const capture = await installCatalogRoute(page, [
    { status: 200, data: [sharedModel] },
    { status: 503 },
    { status: 200, data: [visionOnlyModel, sharedTransferOnlyModel] },
  ]);
  await openAuthenticatedSettings(page);
  await page.getByTestId('openrouter-api-key-input').fill('sk-or-test-refresh-secret');
  await page.getByTestId('openrouter-save-key-button').click();
  await page.getByTestId('openrouter-vision-model').selectOption('provider/shared:free');
  await page.getByTestId('openrouter-transfer-model').selectOption('provider/shared:free');

  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('alert')).toContainText('could not provide the model catalog');
  await expect(page.getByTestId('openrouter-vision-model')).toBeDisabled();
  await expect(page.getByTestId('openrouter-transfer-model')).toBeDisabled();

  const storedAfterFailure = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('conspectus.openRouterReceiptSettings') ?? '{}'),
  );
  expect(storedAfterFailure.settingsByAccountId['mock-home-account']).toMatchObject({
    visionModelId: 'provider/shared:free',
    transferModelId: 'provider/shared:free',
  });

  await page.getByTestId('openrouter-retry-catalog-button').click();
  await expect(page.getByTestId('openrouter-vision-model')).toBeEnabled();
  await expect(page.getByTestId('openrouter-transfer-model')).toBeEnabled();
  await expect(page.getByTestId('openrouter-vision-model')).toHaveValue('');
  await expect(page.getByTestId('openrouter-transfer-model')).toHaveValue('provider/shared:free');
  const storedAfterSuccessfulRetry = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('conspectus.openRouterReceiptSettings') ?? '{}'),
  );
  expect(storedAfterSuccessfulRetry.settingsByAccountId['mock-home-account']).toMatchObject({
    visionModelId: null,
    transferModelId: 'provider/shared:free',
  });
  expect(capture.requests).toHaveLength(3);

  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(
    page.getByText('The API key is valid and the current model catalog is loaded.'),
  ).toBeVisible();
  expect(capture.requests).toHaveLength(4);
});

test('does not expose one Microsoft account configuration to another and supports explicit deletion', async ({
  context,
  page,
}) => {
  await installCatalogRoute(page, [{ status: 200, data: [sharedModel] }]);
  await installMockAuthClient(page, {
    startAuthenticated: true,
    accountHomeAccountId: 'account-one',
    accountUsername: 'one@example.com',
  });
  await page.goto(appPath('#/settings'));
  await page.getByTestId('openrouter-api-key-input').fill('sk-or-test-account-one');
  await page.getByTestId('openrouter-save-key-button').click();
  await expect(page.getByTestId('openrouter-key-configured')).toBeVisible();

  const secondPage = await context.newPage();
  const secondCapture = await installCatalogRoute(secondPage, [
    { status: 200, data: [sharedModel] },
  ]);
  await installMockAuthClient(secondPage, {
    startAuthenticated: true,
    accountHomeAccountId: 'account-two',
    accountUsername: 'two@example.com',
  });
  await secondPage.goto(appPath('#/settings'));
  await expect(secondPage.getByText('two@example.com')).toBeVisible();
  await expect(secondPage.getByTestId('openrouter-key-configured')).toHaveCount(0);
  await expect(secondPage.getByTestId('openrouter-vision-model')).toBeDisabled();
  expect(secondCapture.requests).toHaveLength(0);
  await secondPage.close();

  await page.getByTestId('openrouter-delete-key-button').click();
  await expect(page.getByTestId('openrouter-key-configured')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem('conspectus.openRouterReceiptSettings')),
  ).toBeNull();
});
