import type { Page } from '@playwright/test';

// Synthetic API scores only; each fixture model supplies its exact canonical_slug.
export const installOpenRouterBenchmarkFixture = async (page: Page) => {
  await page.route('https://openrouter.ai/api/v1/benchmarks?**', async (route) => {
    await route.fulfill({
      status: route.request().method() === 'OPTIONS' ? 204 : 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      },
      body:
        route.request().method() === 'OPTIONS'
          ? ''
          : JSON.stringify({
              data: ['shared', 'text', 'vision'].map((role) => ({
                source: 'artificial-analysis',
                model_permaslug: `provider/${role}-snapshot`,
                intelligence_index: 25,
              })),
            }),
    });
  });
};
