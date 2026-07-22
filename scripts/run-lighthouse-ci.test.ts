// Verifies Lighthouse score aggregation, release thresholds, and deployed PWA checks.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateReports,
  parseArgs,
  readBudgetConfig,
  renderSummary,
  validateServiceWorkerRegistration,
  verifyPwaContract,
} from './run-lighthouse-ci.mjs';

const budgetConfig = {
  numberOfRuns: 3,
  categories: {
    performance: { label: 'Performance', minimumScore: 0.8 },
    accessibility: { label: 'Accessibility', minimumScore: 0.9 },
    'best-practices': { label: 'Best Practices', minimumScore: 0.9 },
  },
  audits: {
    'is-on-https': { label: 'HTTPS', minimumScore: 1 },
    viewport: { label: 'Mobile viewport', minimumScore: 1 },
  },
};

const createReport = (performance: number, accessibility = 0.95, bestPractices = 0.96) => ({
  categories: {
    performance: { score: performance },
    accessibility: { score: accessibility },
    'best-practices': { score: bestPractices },
  },
  audits: {
    'is-on-https': { score: 1 },
    viewport: { score: 1 },
  },
});

const pwaContract = {
  passed: true,
  checks: ['HTTPS route', 'installable manifest', 'registered service worker scope'],
};

const asResponse = (body: string, status = 200) => new Response(body, { status });

const appHtml = `<!doctype html>
<html><head><link rel="manifest" href="manifest.webmanifest"></head><body><div id="app"></div></body></html>`;
const manifest = JSON.stringify({
  name: 'Conspectus Mobile',
  short_name: 'Conspectus',
  start_url: '/Conspectus-Mobile/previews/test/',
  scope: '/Conspectus-Mobile/previews/test/',
  display: 'standalone',
  icons: [
    { src: 'icons/moneysack192x192.png', sizes: '192x192', purpose: 'any' },
    { src: 'icons/moneysack512x512.png', sizes: '512x512', purpose: 'any maskable' },
    {
      src: 'icons/moneysack-maskable192x192.png',
      sizes: '192x192',
      purpose: 'maskable',
    },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Lighthouse CI runner', () => {
  it('normalizes an HTTPS target and rejects non-HTTPS targets', () => {
    expect(parseArgs(['https://example.com/app', 'reports/custom']).url.toString()).toBe(
      'https://example.com/app/',
    );
    expect(parseArgs(['https://example.com/app', 'reports/custom']).outputDir).toBe(
      'reports/custom',
    );
    expect(() => parseArgs(['--url', 'http://example.com/app/'])).toThrow(
      'Use an absolute HTTPS URL',
    );
  });

  it('validates the committed budget schema', () => {
    const fixturePath = mkdtempSync(path.join(tmpdir(), 'lighthouse-budget-'));
    try {
      const configPath = path.join(fixturePath, 'budget.json');
      mkdirSync(path.dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify(budgetConfig));
      expect(readBudgetConfig(configPath)).toEqual(budgetConfig);

      writeFileSync(configPath, JSON.stringify({ ...budgetConfig, numberOfRuns: 0 }));
      expect(() => readBudgetConfig(configPath)).toThrow('positive integer');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('uses median category scores and requires deterministic audits on every run', () => {
    const passingEvaluation = evaluateReports(
      [createReport(0.78), createReport(0.82), createReport(0.9)],
      budgetConfig,
      pwaContract,
    );
    expect(passingEvaluation.passed).toBe(true);
    expect(passingEvaluation.checks[0]).toMatchObject({
      label: 'Performance',
      observedScore: 0.82,
      passed: true,
    });

    const failingPerformanceEvaluation = evaluateReports(
      [createReport(0.7), createReport(0.75), createReport(0.79)],
      budgetConfig,
      pwaContract,
    );
    expect(failingPerformanceEvaluation.passed).toBe(false);
    expect(failingPerformanceEvaluation.checks[0]).toMatchObject({
      observedScore: 0.75,
      passed: false,
    });

    const failingViewportReport = createReport(0.9);
    failingViewportReport.audits.viewport.score = 0;
    const failingEvaluation = evaluateReports(
      [createReport(0.9), failingViewportReport, createReport(0.9)],
      budgetConfig,
      pwaContract,
    );
    expect(failingEvaluation.passed).toBe(false);
    expect(failingEvaluation.checks.find((check) => check.id === 'viewport')).toMatchObject({
      observedScore: 0,
      passed: false,
    });
  });

  it('renders thresholds and the PWA contract in the report summary', () => {
    const evaluation = evaluateReports(
      [createReport(0.85), createReport(0.86), createReport(0.87)],
      budgetConfig,
      pwaContract,
    );
    const summary = renderSummary({
      targetUrl: 'https://example.com/app/',
      reportCount: 3,
      evaluation,
    });

    expect(summary).toContain('| Performance | 86% | >= 80% | median | PASS |');
    expect(summary).toContain(
      'PWA checks: HTTPS route; installable manifest; registered service worker scope.',
    );
    expect(summary).toContain('**Result: PASSED**');
  });

  it('verifies the deployed manifest, service worker, and required install icons', async () => {
    const baseUrl = new URL('https://example.com/Conspectus-Mobile/previews/test/');
    const responses = new Map([
      [baseUrl.toString(), asResponse(appHtml)],
      [new URL('manifest.webmanifest', baseUrl).toString(), asResponse(manifest)],
      [new URL('icons/moneysack192x192.png', baseUrl).toString(), asResponse('icon')],
      [new URL('icons/moneysack512x512.png', baseUrl).toString(), asResponse('icon')],
      [new URL('icons/moneysack-maskable192x192.png', baseUrl).toString(), asResponse('icon')],
      [new URL('sw.js', baseUrl).toString(), asResponse('service worker')],
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return responses.get(url) ?? asResponse('not found', 404);
    }) as typeof fetch;
    const serviceWorkerVerifier = vi.fn(async () => undefined);

    await expect(verifyPwaContract(baseUrl, fetchMock, serviceWorkerVerifier)).resolves.toEqual({
      passed: true,
      checks: [
        'HTTPS route',
        'installable manifest',
        'route-correct manifest scope',
        'registered service worker scope',
        'any and maskable 192px and 512px icons',
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(serviceWorkerVerifier).toHaveBeenCalledWith(baseUrl);
  });

  it('fails the PWA contract when manifest scope does not match the deployed route', async () => {
    const baseUrl = new URL('https://example.com/Conspectus-Mobile/previews/test/');
    const invalidManifest = JSON.stringify({ ...JSON.parse(manifest), scope: '/' });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === baseUrl.toString()) return asResponse(appHtml);
      if (url.endsWith('manifest.webmanifest')) return asResponse(invalidManifest);
      return asResponse('asset');
    }) as typeof fetch;

    await expect(verifyPwaContract(baseUrl, fetchMock, vi.fn())).rejects.toThrow(
      'Manifest scope must resolve',
    );
  });

  it('fails the PWA contract when maskable icon purpose metadata is missing', async () => {
    const baseUrl = new URL('https://example.com/Conspectus-Mobile/previews/test/');
    const parsedManifest = JSON.parse(manifest) as {
      icons: Array<{ src: string; purpose?: string }>;
    };
    parsedManifest.icons = parsedManifest.icons.map((icon) =>
      icon.src.includes('maskable') ? { ...icon, purpose: 'any' } : icon,
    );
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === baseUrl.toString()) return asResponse(appHtml);
      if (url.endsWith('manifest.webmanifest')) {
        return asResponse(JSON.stringify(parsedManifest));
      }
      return asResponse('asset');
    }) as typeof fetch;

    await expect(verifyPwaContract(baseUrl, fetchMock, vi.fn())).rejects.toThrow(
      'purpose maskable',
    );
  });

  it.each(['start_url', 'scope'])(
    'rejects a cross-origin manifest %s even when the path matches',
    async (manifestField) => {
      const baseUrl = new URL('https://example.com/Conspectus-Mobile/previews/test/');
      const invalidManifest = JSON.stringify({
        ...JSON.parse(manifest),
        [manifestField]: `https://attacker.example${baseUrl.pathname}`,
      });
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url === baseUrl.toString()) return asResponse(appHtml);
        if (url.endsWith('manifest.webmanifest')) return asResponse(invalidManifest);
        return asResponse('asset');
      }) as typeof fetch;

      await expect(verifyPwaContract(baseUrl, fetchMock, vi.fn())).rejects.toThrow(
        `Manifest ${manifestField} must use deployed origin`,
      );
    },
  );

  it('requires the registered service worker to control the deployed scope from sw.js', () => {
    const baseUrl = new URL('https://example.com/Conspectus-Mobile/previews/test/');
    expect(() =>
      validateServiceWorkerRegistration(
        {
          scope: baseUrl.toString(),
          scriptUrl: new URL('sw.js', baseUrl).toString(),
        },
        baseUrl,
      ),
    ).not.toThrow();

    expect(() =>
      validateServiceWorkerRegistration(
        {
          scope: 'https://example.com/',
          scriptUrl: new URL('sw.js', baseUrl).toString(),
        },
        baseUrl,
      ),
    ).toThrow('Service worker scope mismatch');
    expect(() =>
      validateServiceWorkerRegistration(
        {
          scope: baseUrl.toString(),
          scriptUrl: new URL('../sw.js', baseUrl).toString(),
        },
        baseUrl,
      ),
    ).toThrow('Service worker script URL mismatch');
  });

  it('fails when the live browser cannot confirm service worker registration', async () => {
    const baseUrl = new URL('https://example.com/Conspectus-Mobile/previews/test/');
    const responses = new Map([
      [baseUrl.toString(), asResponse(appHtml)],
      [new URL('manifest.webmanifest', baseUrl).toString(), asResponse(manifest)],
      [new URL('icons/moneysack192x192.png', baseUrl).toString(), asResponse('icon')],
      [new URL('icons/moneysack512x512.png', baseUrl).toString(), asResponse('icon')],
      [new URL('icons/moneysack-maskable192x192.png', baseUrl).toString(), asResponse('icon')],
      [new URL('sw.js', baseUrl).toString(), asResponse('service worker')],
    ]);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return responses.get(url) ?? asResponse('not found', 404);
    }) as typeof fetch;
    const failedVerifier = vi.fn(async () => {
      throw new Error('Service worker scope mismatch.');
    });

    await expect(verifyPwaContract(baseUrl, fetchMock, failedVerifier)).rejects.toThrow(
      'Service worker scope mismatch',
    );
  });
});
