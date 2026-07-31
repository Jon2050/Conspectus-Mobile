// Verifies the browser-visible native receipt capture boundary without simulating OS camera UI.
import { expect, test, type Page, type Request } from '@playwright/test';

import {
  appPath,
  getGraphUploadCallCount,
  getLocalTransferWriteCallCount,
  installReadyAddTransferTestDb,
} from './support/app-test-harness';

test.use({ viewport: { width: 320, height: 720 } });

const RECEIPT_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const MODEL = {
  id: 'provider/shared:free',
  name: 'Shared Free Model',
  architecture: {
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
  },
  pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
  supported_parameters: ['structured_outputs'],
};

const EXTRACTION = {
  status: 'ok',
  errorReason: null,
  storeName: 'Markt',
  receiptDate: '2026-07-31',
  currency: 'EUR',
  receiptTotalCents: 350,
  items: [
    {
      index: 0,
      name: 'Brot',
      quantityText: null,
      lineTotalCents: 350,
      kind: 'item',
    },
  ],
};

const DERIVATION = {
  status: 'ok',
  errorReason: null,
  receiptTotalCents: 350,
  transfers: [
    {
      name: 'Lebensmittel',
      amountCents: 350,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      buyplace: 'Markt',
      receiptDate: '2026-07-31',
      sourceItemIndexes: [0],
    },
  ],
};

const MULTI_EXTRACTION = {
  ...EXTRACTION,
  receiptTotalCents: 500,
  items: [
    { index: 0, name: 'Brot', quantityText: null, lineTotalCents: 300, kind: 'item' },
    { index: 1, name: 'Reiniger', quantityText: null, lineTotalCents: 200, kind: 'item' },
  ],
};

const MULTI_DERIVATION = {
  ...DERIVATION,
  receiptTotalCents: 500,
  transfers: [
    {
      name: 'Lebensmittel',
      amountCents: 300,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      buyplace: 'Markt',
      receiptDate: '2026-07-31',
      sourceItemIndexes: [0],
    },
    {
      name: 'Haushaltsartikel',
      amountCents: 200,
      categoryNames: ['Einkauf', 'Haushalt'],
      buyplace: 'Markt',
      receiptDate: '2026-07-31',
      sourceItemIndexes: [1],
    },
  ],
};

const installReadyReceiptConfiguration = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'conspectus.openRouterReceiptSettings',
      JSON.stringify({
        version: 1,
        settingsByAccountId: {
          'mock-home-account': {
            apiKey: 'sk-or-e2e-secret',
            visionModelId: 'provider/shared:free',
            transferModelId: 'provider/shared:free',
            transferPromptOverride: null,
          },
        },
      }),
    );
  });
};

const installReceiptAnalysisRoutes = async (
  page: Page,
  completionBodies: readonly unknown[],
): Promise<{ readonly catalogRequests: Request[]; readonly completionRequests: Request[] }> => {
  const catalogRequests: Request[] = [];
  const completionRequests: Request[] = [];

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
    catalogRequests.push(request);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ data: [MODEL] }),
    });
  });

  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization,content-type',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        },
      });
      return;
    }

    completionRequests.push(request);
    const response = completionBodies[completionRequests.length - 1] ?? completionBodies.at(-1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(response) },
          },
        ],
      }),
    });
  });

  return { catalogRequests, completionRequests };
};

test('exposes one native outward-camera image input without custom capture or gallery UI', async ({
  page,
}) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Einkauf' },
      { categoryId: 21, name: 'Lebensmittel' },
    ],
  });

  await page.goto(appPath('#/add'));

  const photoButton = page.getByTestId('receipt-photo-button');
  const nativeInput = page.getByTestId('receipt-image-input');
  await expect(photoButton).toBeVisible();
  await expect(page.getByTestId('receipt-semantic-risk')).toContainText(
    'AI classification can still be semantically wrong',
  );
  await expect(photoButton).toHaveAccessibleName('Photograph receipt');
  await expect(nativeInput).toHaveAttribute('type', 'file');
  await expect(nativeInput).toHaveAttribute('accept', 'image/*');
  await expect(nativeInput).toHaveAttribute('capture', 'environment');
  await expect(nativeInput).not.toHaveAttribute('multiple', '');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('[data-testid*="gallery"]')).toHaveCount(0);
  await expect(page.locator('[data-testid*="receipt-preview"]')).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  const captureSectionSize = await page
    .locator('.add-transfer-form__receipt')
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  expect(captureSectionSize.clientWidth).toBeGreaterThan(0);
  expect(captureSectionSize.scrollWidth).toBeLessThanOrEqual(captureSectionSize.clientWidth);
});

test('runs both OpenRouter stages and automatically commits one validated transfer', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },
      ],
    },
    { uploadDelayMs: 400 },
  );
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await expect(page.getByTestId('receipt-progress')).toBeVisible();
  await expect(page.getByTestId('receipt-progress')).toHaveAccessibleName(
    'Receipt processing progress',
  );
  await expect(page.getByTestId('receipt-step-extraction')).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('add-transfer-from-account')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-date')).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-submit')).toHaveCount(0);
  await expect(page.getByTestId('receipt-progress')).not.toContainText('%');
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await expect(page.getByTestId('receipt-step-derivation')).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('add-transfer-from-account')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('11');
  await expect(page.getByTestId('receipt-step-creation')).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('add-transfer-close')).toBeDisabled();
  await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
  await expect(page.getByTestId('receipt-step-creation')).toHaveAttribute('data-state', 'complete');

  expect(requests.catalogRequests).toHaveLength(2);
  expect(requests.completionRequests).toHaveLength(2);
  const stageOneRequest = requests.completionRequests[0];
  const stageTwoRequest = requests.completionRequests[1];
  expect(stageOneRequest?.headers().authorization).toBe('Bearer sk-or-e2e-secret');
  expect(stageTwoRequest?.headers().authorization).toBe('Bearer sk-or-e2e-secret');
  const stageOneBody = stageOneRequest?.postDataJSON() as Record<string, unknown>;
  const stageTwoBody = stageTwoRequest?.postDataJSON() as Record<string, unknown>;
  expect(JSON.stringify(stageOneBody)).toContain('data:image/jpeg;base64,');
  expect(JSON.stringify(stageTwoBody)).not.toContain('data:image/jpeg;base64,');
  expect(JSON.stringify(stageTwoBody)).not.toContain('accountId');
  expect(JSON.stringify(stageOneBody)).not.toContain('accountId');
  expect(stageOneBody.provider).toEqual({ allow_fallbacks: false });
  expect(stageTwoBody.provider).toEqual({
    allow_fallbacks: false,
    require_parameters: true,
  });
  expect(stageTwoBody.response_format).toMatchObject({
    type: 'json_schema',
    json_schema: { strict: true },
  });
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);

  await page.getByTestId('add-transfer-close').click();
  await page.locator('a[href="#/add"]').click();
  await expect(page.getByTestId('receipt-commit-success')).toHaveCount(0);
  await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
});

test('waits for a deliberate late source selection and commits a multi-transfer batch once', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  await installReceiptAnalysisRoutes(page, [MULTI_EXTRACTION, MULTI_DERIVATION]);
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Einkauf' },
      { categoryId: 21, name: 'Lebensmittel' },
      { categoryId: 22, name: 'Haushalt' },
    ],
  });
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'multi-receipt.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });

  await expect(page.getByTestId('receipt-account-required')).toBeVisible();
  await expect(page.getByTestId('receipt-step-extraction')).toHaveAttribute(
    'data-state',
    'complete',
  );
  await expect(page.getByTestId('receipt-step-derivation')).toHaveAttribute(
    'data-state',
    'complete',
  );
  await expect(page.getByTestId('receipt-step-creation')).toHaveAttribute('data-state', 'pending');
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-from-account').locator('option')).toHaveCount(2);

  await page.getByTestId('add-transfer-from-account').selectOption('11');

  await expect(page.getByTestId('receipt-commit-success')).toContainText('2 transfers created');
  await expect(page.getByTestId('receipt-step-creation')).toHaveAttribute('data-state', 'complete');
  await expect(page.locator('[data-testid*="receipt-review"]')).toHaveCount(0);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  if ((await page.getByTestId('transfers-month-label').textContent())?.includes('August 2026')) {
    await page.getByTestId('transfers-month-previous-button').click();
  }
  await expect(page.getByTestId('route-transfers')).toContainText('Lebensmittel');
  await expect(page.getByTestId('route-transfers')).toContainText('Haushaltsartikel');
});

test('clears completed receipt state when upload finishes after leaving Add', async ({ page }) => {
  await installReadyReceiptConfiguration(page);
  await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      ],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },
      ],
    },
    { uploadDelayMs: 800 },
  );
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'leave-during-upload.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await expect(
    page.locator('[data-testid="progress-indicator"][data-kind="upload"]'),
  ).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  await expect(page.getByTestId('route-transfers')).toBeVisible();
  await expect(page.locator('.toast-container')).toContainText('1 transfer created');

  await page.evaluate(() => {
    window.location.hash = '#/add';
  });
  await expect(page.getByTestId('receipt-commit-success')).toHaveCount(0);
  await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
});

test('cancels an active run on route abandonment and never restores its source or results', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Einkauf' },
      { categoryId: 21, name: 'Lebensmittel' },
    ],
  });
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'cancelled-receipt.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await expect(page.getByTestId('receipt-progress')).toBeVisible();
  await page.getByTestId('add-transfer-close').click();
  await expect(page.getByTestId('route-transfers')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#/add';
  });
  await expect(page).toHaveURL(/#\/add$/);
  await expect(page.getByTestId('receipt-photo-button')).toBeVisible();
  await expect(page.getByTestId('receipt-progress')).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('');
  await page.waitForTimeout(700);
  await expect(page.getByTestId('receipt-progress')).toHaveCount(0);
  expect(await getLocalTransferWriteCallCount(page)).toBe(0);
  expect(await getGraphUploadCallCount(page)).toBe(0);
});

test('ends a model-declared failure and starts again only after a fresh file selection', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [
    {
      status: 'error',
      errorReason: 'Der Gesamtbetrag ist nicht eindeutig lesbar.',
      storeName: null,
      receiptDate: null,
      currency: null,
      receiptTotalCents: null,
      items: [],
    },
    EXTRACTION,
    DERIVATION,
  ]);
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Einkauf' },
      { categoryId: 21, name: 'Lebensmittel' },
    ],
  });
  await page.goto(appPath('#/add'));

  const input = page.getByTestId('receipt-image-input');
  await input.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE });
  await expect(page.getByTestId('add-transfer-form-error')).toContainText(
    'Der Gesamtbetrag ist nicht eindeutig lesbar.',
  );
  expect(requests.completionRequests).toHaveLength(1);
  await page.waitForTimeout(300);
  expect(requests.completionRequests).toHaveLength(1);
  await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
  await expect(page.getByTestId('receipt-photo-button')).toHaveAccessibleName(
    'Photograph a new receipt',
  );
  await expect(page.getByTestId('add-transfer-from-account')).toHaveCount(0);
  await expect(page.getByTestId('receipt-step-extraction')).toHaveAttribute('data-state', 'error');
  await expect(page.getByTestId('receipt-analysis-retry')).toHaveCount(0);

  await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE });
  await expect(page.getByTestId('add-transfer-from-account')).toBeEnabled();
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
  expect(requests.completionRequests).toHaveLength(3);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
});

test('retries only exported bytes after a transport failure without another SQL or LLM run', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      ],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },
      ],
    },
    {
      uploadErrorSequence: [
        { code: 'network_error', message: 'Temporary network failure', status: 503 },
      ],
    },
  );
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'retry-receipt.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await expect(page.getByTestId('receipt-upload-retry')).toBeVisible();
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
  expect(requests.completionRequests).toHaveLength(2);

  await page.getByTestId('receipt-upload-retry').click();
  await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(2);
  expect(requests.completionRequests).toHaveLength(2);
});

test('keeps byte-only retry visible when connectivity is lost during upload', async ({ page }) => {
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      ],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },
      ],
    },
    { uploadDelayMs: 800, failUploadWhenOfflineAfterDelay: true },
  );
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'offline-during-upload.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await expect(
    page.locator('[data-testid="progress-indicator"][data-kind="upload"]'),
  ).toBeVisible();
  await page.context().setOffline(true);

  await expect(page.getByTestId('receipt-upload-retry')).toBeVisible();
  await expect(page.getByTestId('receipt-upload-retry')).toBeDisabled();
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
  expect(requests.completionRequests).toHaveLength(2);

  await page.context().setOffline(false);
  await expect(page.getByTestId('receipt-upload-retry')).toBeEnabled();
  await page.getByTestId('receipt-upload-retry').click();
  await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(2);
  expect(requests.completionRequests).toHaveLength(2);
});

test('refreshes an eTag conflict and waits for an explicit revalidated batch retry', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      ],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },
      ],
    },
    {
      uploadErrorSequence: [{ code: 'conflict', message: 'Precondition failed', status: 412 }],
    },
  );
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'conflict-receipt.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await expect(page.getByTestId('receipt-conflict-refresh')).toBeVisible();
  expect(await getGraphUploadCallCount(page)).toBe(1);

  await page.getByTestId('receipt-conflict-refresh').click();
  await expect(page.getByTestId('receipt-conflict-retry')).toBeVisible();
  expect(await getGraphUploadCallCount(page)).toBe(1);
  await expect(page.locator('[data-testid*="receipt-review"]')).toHaveCount(0);

  await page.getByTestId('receipt-conflict-retry').click();
  await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
  expect(await getLocalTransferWriteCallCount(page)).toBe(2);
  expect(await getGraphUploadCallCount(page)).toBe(2);
  expect(requests.completionRequests).toHaveLength(2);
});

test('shows remote-save reconciliation failure without any write or upload retry', async ({
  page,
}) => {
  await installReadyReceiptConfiguration(page);
  await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(
    page,
    {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      ],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },
      ],
    },
    {},
    { writeSnapshotErrorSequence: [false, true, true] },
  );
  await page.goto(appPath('#/add'));

  await page.getByTestId('receipt-image-input').setInputFiles({
    name: 'remote-saved-receipt.png',
    mimeType: 'image/png',
    buffer: RECEIPT_IMAGE,
  });
  await page.getByTestId('add-transfer-from-account').selectOption('11');

  await expect(page.getByTestId('receipt-remote-saved')).toContainText(
    'saved to OneDrive, but local data could not be refreshed',
  );
  await expect(page.getByTestId('receipt-upload-retry')).toHaveCount(0);
  await expect(page.getByTestId('receipt-conflict-retry')).toHaveCount(0);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
});
