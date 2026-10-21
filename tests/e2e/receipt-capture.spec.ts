// Verifies the browser-visible native receipt capture boundary without simulating OS camera UI.
import { expect, test, type Page, type Request } from '@playwright/test';
import fs from 'node:fs';
import { installOpenRouterBenchmarkFixture } from './support/openrouter-benchmarks';

import {
  appPath,
  getGraphUploadCallCount,
  getLocalTransferWriteCallCount,
  installReadyAddTransferTestDb,
} from './support/app-test-harness';

test.use({ viewport: { width: 320, height: 720 } });
test.beforeEach(async ({ page }) => installOpenRouterBenchmarkFixture(page));

const RECEIPT_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const MODEL = {
  id: 'provider/shared:free',
  canonical_slug: 'provider/shared-snapshot',
  name: 'Shared Free Model',
  architecture: {
    input_modalities: ['text', 'image'],
    output_modalities: ['text'],
  },
  pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
  supported_parameters: [],
  reasoning: {
    mandatory: false,
    supported_efforts: ['high', 'low', 'none'],
    default_enabled: false,
    default_effort: 'none',
  },
};

const READY_RECEIPT_DB = {
  fromAccountOptionRows: [{ accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 }],
  toAccountOptionRows: [{ accountId: 2, name: 'Spendings', amountCents: 0, accountTypeId: 2 }],
  categoryRows: [
    'Einkauf',
    'Lebensmittel',
    'Haushalt, Verbrauchsgüter, Reinigung',
    'Süßigkeiten',
    'Restaurant, Bar, Bäcker',
  ].map((name, index) => ({ categoryId: 20 + index, name })),
};

for (const failure of ['missing_destination', 'missing_category', 'ambiguous_category'] as const) {
  test(`rejects receipt setup before remote calls: ${failure}`, async ({ page }) => {
    await installReadyReceiptConfiguration(page);
    const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
    await installReadyAddTransferTestDb(page, {
      ...READY_RECEIPT_DB,
      ...(failure === 'missing_destination' ? { toAccountOptionRows: [] } : {}),
      categoryRows:
        failure === 'missing_category'
          ? []
          : failure === 'ambiguous_category'
            ? [...READY_RECEIPT_DB.categoryRows, { categoryId: 40, name: 'Einkauf' }]
            : READY_RECEIPT_DB.categoryRows,
    });
    await page.goto(appPath('#/add'));
    await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
    await page.getByTestId('receipt-photo-button').click();
    await expect(page.getByTestId('add-transfer-form-error')).toContainText(
      failure === 'missing_destination' ? 'primary spendings account' : 'category "Einkauf"',
    );
    // Native picker return is checked again, independently of the button path.
    await page
      .getByTestId('receipt-image-input')
      .setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE });
    expect(requests.catalogRequests).toHaveLength(0);
    expect(requests.completionRequests).toHaveLength(0);
    expect(await getLocalTransferWriteCallCount(page)).toBe(0);
    expect(await getGraphUploadCallCount(page)).toBe(0);
  });
}

for (const limitedStage of [1, 2]) {
  test(`explains catalog rate limiting at stage ${limitedStage} without automatic retry`, async ({
    page,
  }) => {
    await installReadyReceiptConfiguration(page);
    const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
    let catalogCalls = 0;
    await page.route('https://openrouter.ai/api/v1/models/user', async (route) => {
      catalogCalls++;
      await route.fulfill({
        status: catalogCalls === limitedStage ? 429 : 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ data: [MODEL] }),
      });
    });
    await installReadyAddTransferTestDb(page, READY_RECEIPT_DB);
    await page.goto(appPath('#/add'));
    await page
      .getByTestId('receipt-image-input')
      .setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE });
    await expect(page.getByTestId('add-transfer-form-error')).toContainText('rate limiting');
    await expect(page.getByTestId('receipt-activity')).toHaveCount(0);
    await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
    await page.waitForTimeout(350);
    expect(catalogCalls).toBe(limitedStage);
    expect(requests.completionRequests).toHaveLength(limitedStage - 1);
    expect(await getGraphUploadCallCount(page)).toBe(0);
  });
}

test('normalizes the long synthetic receipt to a bounded JPEG before provider handoff', async ({
  page,
}) => {
  // Exercise the actual image-element fallback under both document and response-header CSP.
  await page.addInitScript(() => {
    window.createImageBitmap = async () => {
      throw new Error('Exercise native image fallback');
    };
  });
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION]);
  await installReadyAddTransferTestDb(page, READY_RECEIPT_DB);
  await page.goto(appPath('#/add'));
  const image = fs.readFileSync('tests/fixtures/receipts/long-receipt.svg');
  await page
    .getByTestId('receipt-image-input')
    .setInputFiles({ name: 'long-receipt.svg', mimeType: 'image/svg+xml', buffer: image });
  await expect.poll(() => requests.completionRequests.length).toBeGreaterThan(0);
  const body = requests.completionRequests[0]!.postDataJSON();
  const dataUrl = body.messages[1].content[1].image_url.url as string;
  const dimensions = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      size: atob(url.split(',')[1]!).length,
      type: url.split(';')[0]!.slice(5),
    };
  }, dataUrl);
  expect(dimensions.height).toBe(2560);
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.width).toBeLessThan(720);
  expect(dimensions.type).toBe('image/jpeg');
  expect(dimensions.size).toBeLessThanOrEqual(4 * 1024 * 1024);
  // Provider responses are mocks; this asserts transport normalization, not OCR legibility.
});

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
  buyplace: 'Markt',
  transfers: [
    {
      name: 'Brot',
      amountCents: 350,
      categoryNames: ['Einkauf', 'Lebensmittel'],
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
  buyplace: 'Rewe',
  transfers: [
    {
      name: 'Brot',
      amountCents: 300,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      sourceItemIndexes: [0],
    },
    {
      name: 'Reiniger',
      amountCents: 200,
      categoryNames: ['Einkauf', 'Haushalt, Verbrauchsgüter, Reinigung'],
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
            transferRulesOverride: null,
          },
        },
      }),
    );
  });
};

const installReceiptAnalysisRoutes = async (
  page: Page,
  completionBodies: readonly unknown[],
  firstStageGate?: Promise<void>,
  secondStageGate?: Promise<void>,
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
    if (completionRequests.length === 1) await firstStageGate;
    if (completionRequests.length === 2) await secondStageGate;
    const response = completionBodies[completionRequests.length - 1] ?? completionBodies.at(-1);
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

      { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
      { categoryId: 23, name: 'Süßigkeiten' },
      { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
    ],
  });

  await page.goto(appPath('#/add'));

  const photoButton = page.getByTestId('receipt-photo-button');
  const nativeInput = page.getByTestId('receipt-image-input');
  await expect(photoButton).toBeVisible();
  await expect(page.getByTestId('receipt-semantic-risk')).toContainText(
    'Review the suggested data before saving',
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

test('runs both OpenRouter stages and saves only after explicit review', async ({ page }) => {
  await installReadyReceiptConfiguration(page);
  let releaseExtraction!: () => void;
  const extractionGate = new Promise<void>((resolve) => {
    releaseExtraction = resolve;
  });
  let releaseDerivation!: () => void;
  const derivationGate = new Promise<void>((resolve) => {
    releaseDerivation = resolve;
  });
  const requests = await installReceiptAnalysisRoutes(
    page,
    [EXTRACTION, DERIVATION],
    extractionGate,
    derivationGate,
  );
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

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await expect(page.getByTestId('receipt-activity')).toBeVisible();
  await expect(
    page.getByTestId('receipt-step-extraction').locator('.receipt-progress__marker'),
  ).toHaveCSS('animation-iteration-count', 'infinite');
  await expect(page.getByTestId('add-transfer-from-account')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-date')).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-submit')).toHaveCount(0);
  await expect(page.getByTestId('receipt-progress')).not.toContainText('%');
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  releaseExtraction();
  await expect(page.getByTestId('receipt-step-derivation')).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('receipt-step-extraction')).toHaveAttribute(
    'data-state',
    'complete',
  );
  await expect(page.getByTestId('receipt-activity')).toBeVisible();
  await expect(
    page.getByTestId('receipt-step-derivation').locator('.receipt-progress__marker'),
  ).toHaveCSS('animation-iteration-count', 'infinite');
  await page.screenshot({
    path: `output/receipt-review/processing-${test.info().project.name}.png`,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByTestId('receipt-step-derivation').locator('.receipt-progress__marker'),
  ).toHaveCSS('animation-name', 'none');
  await expect(page.getByTestId('receipt-activity')).toBeVisible();
  releaseDerivation();
  await expect(page.getByTestId('receipt-review')).toBeVisible();
  await expect(page.getByTestId('receipt-activity')).toHaveCount(0);
  expect(await getLocalTransferWriteCallCount(page)).toBe(0);
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await page.getByTestId('receipt-review-save').click();
  await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
  await expect(page.getByTestId('receipt-step-creation')).toHaveAttribute('data-state', 'complete');
  await expect(page.getByTestId('receipt-saved-summary')).toContainText('Brot');
  await expect(page.getByTestId('receipt-saved-summary')).toContainText('Conspectus Desktop');
  const summarySize = await page
    .getByTestId('receipt-saved-summary')
    .evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(summarySize.scrollWidth).toBeLessThanOrEqual(summarySize.width);
  await page.screenshot({ path: `output/ap4/receipt-summary-${test.info().project.name}.png` });

  expect(requests.catalogRequests).toHaveLength(2);
  expect(requests.completionRequests).toHaveLength(2);
  const stageOneRequest = requests.completionRequests[0];
  const stageTwoRequest = requests.completionRequests[1];
  expect(stageOneRequest?.headers().authorization).toBe('Bearer sk-or-e2e-secret');
  expect(stageTwoRequest?.headers().authorization).toBe('Bearer sk-or-e2e-secret');
  const stageOneBody = stageOneRequest?.postDataJSON() as Record<string, unknown>;
  const stageTwoBody = stageTwoRequest?.postDataJSON() as Record<string, unknown>;
  expect(stageOneBody.reasoning).toEqual({ enabled: true, effort: 'low' });
  expect(stageTwoBody.reasoning).toEqual({ enabled: true, effort: 'low' });
  expect(JSON.stringify(stageOneBody)).toContain('data:image/jpeg;base64,');
  expect(JSON.stringify(stageTwoBody)).not.toContain('data:image/jpeg;base64,');
  expect(JSON.stringify(stageTwoBody)).not.toContain('accountId');
  expect(JSON.stringify(stageOneBody)).not.toContain('accountId');
  expect(stageOneBody.provider).toEqual({ allow_fallbacks: false });
  expect(stageTwoBody.provider).toEqual({
    allow_fallbacks: false,
  });
  expect(stageTwoBody).not.toHaveProperty('response_format');
  expect(stageTwoBody.provider).not.toHaveProperty('require_parameters');
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);

  await page.getByTestId('add-transfer-close').click();
  await page.locator('a[href="#/add"]').click();
  await expect(page.getByTestId('receipt-commit-success')).toHaveCount(0);
  await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
});

test('edits shared fields and grouped transfers and saves the reviewed batch once', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-07-31T12:00:00.000Z'));
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
      { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },

      { categoryId: 23, name: 'Süßigkeiten' },
      { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await expect(page.getByTestId('receipt-review-date')).toHaveValue('2026-07-31');
  await expect(page.getByTestId('receipt-review-buyplace')).toHaveValue('Rewe');
  await page.getByTestId('receipt-review-date').fill('2026-07-30');
  await page.getByTestId('receipt-review-buyplace').fill('Rewe korrigiert');
  await page.getByTestId('receipt-review-name-0').fill('Brot korrigiert');
  await page
    .getByTestId('receipt-review-category-0-1')
    .selectOption('Haushalt, Verbrauchsgüter, Reinigung');
  await page.getByTestId('receipt-review-amount-0').fill('4,00');
  await page.getByTestId('receipt-review-amount-1').fill('1,00');
  expect(await getLocalTransferWriteCallCount(page)).toBe(0);
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await page.screenshot({
    path: `output/receipt-review/review-${test.info().project.name}.png`,
    fullPage: true,
  });
  const reviewWidth = await page
    .getByTestId('receipt-review')
    .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
  expect(reviewWidth.scroll).toBeLessThanOrEqual(reviewWidth.width);
  await page.getByTestId('receipt-review-save').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `output/receipt-review/review-bottom-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByTestId('receipt-review-save').click();

  await expect(page.getByTestId('receipt-commit-success')).toContainText('2 transfers created');
  await expect(page.getByTestId('receipt-step-creation')).toHaveAttribute('data-state', 'complete');
  await expect(page.locator('[data-testid*="receipt-review"]')).toHaveCount(0);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  await expect(page.getByTestId('transfers-month-label')).toHaveText('July 2026');
  await expect(page.getByTestId('route-transfers')).toContainText('Brot');
  await expect(page.getByTestId('route-transfers')).toContainText('Reiniger');
  await expect(page.locator('.transfer-card__date')).toHaveText(['July 30, 2026', 'July 30, 2026']);
  // Stage two supplies this shared normalized name once; both persisted rows inherit it.
  await expect(
    page.locator('.transfer-card__buyplace-prefix').filter({ hasText: '(Rewe korrigiert)' }),
  ).toHaveCount(2);
});

test('reviews and corrects partial responses without any booking before Save', async ({ page }) => {
  await installReadyReceiptConfiguration(page);
  const requests = await installReceiptAnalysisRoutes(page, [
    {
      ...MULTI_EXTRACTION,
      status: 'error',
      errorReason: 'Der Gesamtbetrag ist unleserlich.',
      receiptTotalCents: null,
    },
    { ...MULTI_DERIVATION, status: 'error', errorReason: 'Der Gesamtbetrag fehlt.' },
  ]);
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [{ accountId: 2, name: 'Spendings', amountCents: 0, accountTypeId: 2 }],
    categoryRows: [
      { categoryId: 20, name: 'Einkauf' },
      { categoryId: 21, name: 'Lebensmittel' },
      { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
      { categoryId: 23, name: 'Süßigkeiten' },
      { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
    ],
  });
  await page.goto(appPath('#/add'));
  await page
    .getByTestId('receipt-image-input')
    .setInputFiles({ name: 'partial.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE });
  await expect(page.getByTestId('receipt-review-date')).toHaveValue('2026-07-31');
  await expect(page.getByTestId('receipt-review-buyplace')).toHaveValue('Rewe');
  await expect(page.getByTestId('receipt-review-name-0')).toHaveValue('Brot');
  await expect(page.getByTestId('receipt-review-name-1')).toHaveValue('Reiniger');
  await expect(page.getByTestId('add-transfer-form-error')).toContainText('Gesamtbetrag');
  expect(await getLocalTransferWriteCallCount(page)).toBe(0);
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await page.getByTestId('receipt-review-name-0').fill('Brot korrigiert');
  await page.getByTestId('receipt-review-add').click();
  await page.getByTestId('receipt-review-remove-2').click();
  await page.context().setOffline(true);
  await expect(page.getByTestId('receipt-review-save')).toBeDisabled();
  await expect(page.getByTestId('receipt-review-name-0')).toHaveValue('Brot korrigiert');
  await page.context().setOffline(false);
  await expect(page.getByTestId('receipt-review-save')).toBeEnabled();
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await page.getByTestId('receipt-review-save').click();
  await expect(page.getByTestId('receipt-commit-success')).toContainText('2 transfers created');
  expect(requests.completionRequests).toHaveLength(2);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
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

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await page.getByTestId('receipt-review-save').click();
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

      { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
      { categoryId: 23, name: 'Süßigkeiten' },
      { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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

      { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
      { categoryId: 23, name: 'Süßigkeiten' },
      { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await expect(page.getByTestId('add-transfer-from-account')).toBeVisible();
  await expect(page.getByTestId('receipt-review-date')).toHaveValue('');
  await expect(page.getByTestId('receipt-step-extraction')).toHaveAttribute('data-state', 'error');
  await expect(page.getByTestId('receipt-activity')).toHaveCount(0);
  await expect(page.getByTestId('receipt-analysis-retry')).toHaveCount(0);

  await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE });
  await expect(page.getByTestId('add-transfer-from-account')).toBeEnabled();
  await page.getByTestId('add-transfer-from-account').selectOption('11');
  await page.getByTestId('receipt-review-save').click();
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

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await page.getByTestId('receipt-review-save').click();
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

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await page.getByTestId('receipt-review-save').click();
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

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await page.getByTestId('receipt-review-save').click();
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

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
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
  await page.getByTestId('receipt-review-save').click();

  await expect(page.getByTestId('receipt-remote-saved')).toContainText(
    'saved to OneDrive, but local data could not be refreshed',
  );
  await expect(page.getByTestId('receipt-upload-retry')).toHaveCount(0);
  await expect(page.getByTestId('receipt-conflict-retry')).toHaveCount(0);
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  expect(await getGraphUploadCallCount(page)).toBe(1);
});

for (const pickerReturnsDuringRefresh of [false, true]) {
  test(`keeps receipt processing through an unchanged foreground check (picker returns during refresh: ${pickerReturnsDuringRefresh})`, async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await installReadyReceiptConfiguration(page);
    const requests = await installReceiptAnalysisRoutes(page, [EXTRACTION, DERIVATION], gate);
    await installReadyAddTransferTestDb(page, {
      fromAccountOptionRows: [
        { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [{ accountId: 2, name: 'Spendings', amountCents: 0, accountTypeId: 2 }],
      categoryRows: [
        { categoryId: 20, name: 'Einkauf' },
        { categoryId: 21, name: 'Lebensmittel' },

        { categoryId: 22, name: 'Haushalt, Verbrauchsgüter, Reinigung' },
        { categoryId: 23, name: 'Süßigkeiten' },
        { categoryId: 24, name: 'Restaurant, Bar, Bäcker' },
      ],
    });
    await page.goto(appPath('#/add'));
    // A foreground check must start after bootstrap, as with a previously opened native picker.
    await expect(page.getByTestId('receipt-photo-button')).toBeEnabled();
    const photo = { name: 'receipt.png', mimeType: 'image/png', buffer: RECEIPT_IMAGE };
    if (!pickerReturnsDuringRefresh) {
      await page.getByTestId('receipt-image-input').setInputFiles(photo);
      await expect.poll(() => requests.completionRequests.length).toBe(1);
    }
    await page.evaluate(() => {
      const state = window as typeof window & {
        __CONSPECTUS_GRAPH_CLIENT__: {
          getFileMetadata: (...args: unknown[]) => Promise<unknown>;
        };
        releaseFreshness?: () => void;
      };
      const graph = state.__CONSPECTUS_GRAPH_CLIENT__;
      const original = graph.getFileMetadata;
      graph.getFileMetadata = async (...args) => {
        graph.getFileMetadata = original;
        await new Promise<void>((resolve) => {
          state.releaseFreshness = resolve;
        });
        return original(...args);
      };
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => 'releaseFreshness' in window);
    await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
    if (pickerReturnsDuringRefresh) {
      await expect(page.getByTestId('receipt-image-input')).toBeEnabled();
      await page.getByTestId('receipt-image-input').setInputFiles(photo);
      await expect.poll(() => requests.completionRequests.length).toBe(1);
    }
    await expect(page.getByTestId('receipt-step-extraction')).toHaveAttribute(
      'data-state',
      'active',
    );
    await page.getByTestId('add-transfer-from-account').selectOption('11');
    release();
    await expect(page.getByTestId('receipt-step-derivation')).toHaveAttribute(
      'data-state',
      'complete',
    );
    expect(await getGraphUploadCallCount(page)).toBe(0);
    await page.evaluate(() =>
      (window as typeof window & { releaseFreshness: () => void }).releaseFreshness(),
    );
    await expect(page.getByTestId('receipt-review-save')).toBeEnabled();
    expect(await getGraphUploadCallCount(page)).toBe(0);
    await page.getByTestId('receipt-review-save').click();
    await expect(page.getByTestId('receipt-commit-success')).toContainText('1 transfer created');
    expect(requests.completionRequests).toHaveLength(2);
    expect(await getGraphUploadCallCount(page)).toBe(1);
  });
}
