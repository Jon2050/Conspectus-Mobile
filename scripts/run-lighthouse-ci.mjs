#!/usr/bin/env node
// Runs repeatable mobile Lighthouse release checks and records the deployed PWA contract.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const DEFAULT_BUDGET_CONFIG_PATH = 'lighthouse-budgets.json';
const DEFAULT_OUTPUT_DIRECTORY = 'reports/lighthouse';
const LIGHTHOUSE_CATEGORIES = ['performance', 'accessibility', 'best-practices'];
const INSTALLABLE_DISPLAYS = new Set(['fullscreen', 'minimal-ui', 'standalone']);
const REQUIRED_ICON_SPECS = [
  { size: '192x192', purpose: 'any' },
  { size: '512x512', purpose: 'any' },
  { size: '192x192', purpose: 'maskable' },
  { size: '512x512', purpose: 'maskable' },
];
const require = createRequire(import.meta.url);
const lighthouseCliPath = require.resolve('lighthouse/cli/index.js');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizeBaseUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid --url value "${value}". Use an absolute HTTPS URL.`);
  }

  assert(url.protocol === 'https:', `Invalid --url value "${value}". Use an absolute HTTPS URL.`);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
};

export const parseArgs = (argv) => {
  const args = {
    budgetConfig: DEFAULT_BUDGET_CONFIG_PATH,
    numberOfRuns: null,
    outputDir: DEFAULT_OUTPUT_DIRECTORY,
    url: '',
  };
  const positionalArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      positionalArgs.push(current);
      continue;
    }
    if (current === '--budget-config') {
      args.budgetConfig = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (current === '--output-dir') {
      args.outputDir = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (current === '--number-of-runs') {
      args.numberOfRuns = Number(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (current === '--url') {
      args.url = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${current}`);
  }

  assert(positionalArgs.length <= 2, 'Expected at most a target URL and output directory.');
  if (positionalArgs[0]) {
    assert(!args.url, 'Target URL was provided more than once.');
    args.url = positionalArgs[0];
  }
  if (positionalArgs[1]) {
    assert(
      args.outputDir === DEFAULT_OUTPUT_DIRECTORY,
      'Output directory was provided more than once.',
    );
    args.outputDir = positionalArgs[1];
  }

  assert(args.url, 'Missing required --url argument.');
  assert(args.budgetConfig, 'The --budget-config argument requires a file path.');
  assert(args.outputDir, 'The --output-dir argument requires a directory path.');
  assert(
    args.numberOfRuns === null || (Number.isInteger(args.numberOfRuns) && args.numberOfRuns > 0),
    'The --number-of-runs argument requires a positive integer.',
  );

  return {
    ...args,
    url: normalizeBaseUrl(args.url),
  };
};

const readJson = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${message}`, { cause: error });
  }
};

export const readBudgetConfig = (configPath) => {
  assert(fs.existsSync(configPath), `Lighthouse budget config does not exist: ${configPath}`);
  const config = readJson(configPath, 'Lighthouse budget config');
  assert(
    Number.isInteger(config.numberOfRuns) && config.numberOfRuns > 0,
    'Lighthouse budget config numberOfRuns must be a positive integer.',
  );

  for (const [sectionName, requiredKeys] of [
    ['categories', LIGHTHOUSE_CATEGORIES],
    ['audits', ['is-on-https', 'viewport']],
  ]) {
    for (const key of requiredKeys) {
      const definition = config?.[sectionName]?.[key];
      assert(
        typeof definition?.label === 'string' && definition.label.trim(),
        `Lighthouse budget config ${sectionName}.${key}.label must be a non-empty string.`,
      );
      assert(
        typeof definition?.minimumScore === 'number' &&
          definition.minimumScore >= 0 &&
          definition.minimumScore <= 1,
        `Lighthouse budget config ${sectionName}.${key}.minimumScore must be between 0 and 1.`,
      );
    }
  }

  return config;
};

const median = (values) => {
  const sortedValues = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2
    : sortedValues[midpoint];
};

const requireScore = (value, label) => {
  assert(typeof value === 'number' && value >= 0 && value <= 1, `${label} score is missing.`);
  return value;
};

export const evaluateReports = (reports, budgetConfig, pwaContract) => {
  assert(
    reports.length === budgetConfig.numberOfRuns,
    `Expected ${budgetConfig.numberOfRuns} Lighthouse reports, found ${reports.length}.`,
  );

  const checks = [];
  for (const [categoryId, definition] of Object.entries(budgetConfig.categories)) {
    const scores = reports.map((report) =>
      requireScore(report?.categories?.[categoryId]?.score, definition.label),
    );
    const observedScore = median(scores);
    checks.push({
      id: `categories:${categoryId}`,
      label: definition.label,
      aggregation: 'median',
      minimumScore: definition.minimumScore,
      observedScore,
      passed: observedScore >= definition.minimumScore,
    });
  }

  for (const [auditId, definition] of Object.entries(budgetConfig.audits)) {
    const scores = reports.map((report) =>
      requireScore(report?.audits?.[auditId]?.score, definition.label),
    );
    const observedScore = Math.min(...scores);
    checks.push({
      id: auditId,
      label: definition.label,
      aggregation: 'all runs',
      minimumScore: definition.minimumScore,
      observedScore,
      passed: observedScore >= definition.minimumScore,
    });
  }

  checks.push({
    id: 'pwa-deployment-contract',
    label: 'PWA deployment contract',
    aggregation: 'live route',
    minimumScore: 1,
    observedScore: pwaContract.passed ? 1 : 0,
    passed: pwaContract.passed,
  });

  return {
    checks,
    passed: checks.every((check) => check.passed),
    pwaChecks: pwaContract.checks,
  };
};

const formatPercent = (score) => `${Math.round(score * 100)}%`;
const escapeTableCell = (value) => String(value).replaceAll('|', '\\|');

export const renderSummary = ({ targetUrl, reportCount, evaluation, errorMessage = '' }) => {
  const lines = [
    '## Lighthouse CI — mobile release gate',
    '',
    `- Target: \`${targetUrl}\``,
    `- Lighthouse runs: ${reportCount}`,
    '- Profile: mobile (simulated throttling)',
    '',
  ];

  if (errorMessage) {
    lines.push(`**Result: FAILED** — ${errorMessage}`, '');
  }

  if (evaluation) {
    lines.push(
      '| Check | Observed | Required | Aggregation | Result |',
      '| --- | ---: | ---: | --- | --- |',
    );
    for (const check of evaluation.checks) {
      lines.push(
        `| ${escapeTableCell(check.label)} | ${formatPercent(check.observedScore)} | >= ${formatPercent(check.minimumScore)} | ${check.aggregation} | ${check.passed ? 'PASS' : 'FAIL'} |`,
      );
    }
    lines.push(
      '',
      `PWA checks: ${evaluation.pwaChecks.map(escapeTableCell).join('; ')}.`,
      '',
      `**Result: ${evaluation.passed ? 'PASSED' : 'FAILED'}**`,
      '',
    );
  }

  return `${lines.join('\n')}\n`;
};

const fetchOk = async (fetchImpl, url) => {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  assert(response.status === 200, `${url} returned HTTP ${response.status}.`);
  return response;
};

const findManifestHref = (html) => {
  const manifestTag = html.match(/<link\b[^>]*\brel=["'][^"']*manifest[^"']*["'][^>]*>/iu)?.[0];
  assert(manifestTag, 'App HTML is missing a manifest link.');
  const manifestHref = manifestTag.match(/\bhref=["']([^"']+)["']/iu)?.[1];
  assert(manifestHref, 'App manifest link is missing href.');
  return manifestHref;
};

const findRequiredIconUrls = (manifest, baseUrl) => {
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  return REQUIRED_ICON_SPECS.map(({ size, purpose }) => {
    const match = icons.find(
      (icon) =>
        typeof icon?.src === 'string' &&
        typeof icon?.sizes === 'string' &&
        icon.sizes.split(/\s+/u).includes(size) &&
        typeof icon?.purpose === 'string' &&
        icon.purpose.split(/\s+/u).includes(purpose),
    );
    assert(match, `Manifest is missing a ${size} install icon with purpose ${purpose}.`);
    return new URL(match.src, baseUrl);
  });
};

const assertManifestRoute = (value, label, baseUrl) => {
  const resolvedUrl = new URL(value, baseUrl);
  assert(
    resolvedUrl.origin === baseUrl.origin,
    `Manifest ${label} must use deployed origin ${baseUrl.origin}.`,
  );
  assert(
    resolvedUrl.pathname === baseUrl.pathname,
    `Manifest ${label} must resolve to ${baseUrl.pathname}.`,
  );
};

export const validateServiceWorkerRegistration = (registration, baseUrl) => {
  const expectedScope = baseUrl.toString();
  const expectedScriptUrl = new URL('sw.js', baseUrl).toString();
  assert(
    registration.scope === expectedScope,
    `Service worker scope mismatch. Expected ${expectedScope}, got ${registration.scope || '(missing)'}.`,
  );
  assert(
    registration.scriptUrl === expectedScriptUrl,
    `Service worker script URL mismatch. Expected ${expectedScriptUrl}, got ${registration.scriptUrl || '(missing)'}.`,
  );
};

export const verifyServiceWorkerRegistration = async (baseUrl) => {
  const launchOptions = process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: 'chrome' };
  const browser = await chromium.launch({
    ...launchOptions,
    headless: true,
  });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: false,
      serviceWorkers: 'allow',
    });
    const page = await context.newPage();
    await page.goto(baseUrl.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Browser does not support service workers.');
      }

      const timeout = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Timed out waiting for service worker registration.')),
          10_000,
        );
      });
      const readyRegistration = await Promise.race([navigator.serviceWorker.ready, timeout]);
      const worker =
        readyRegistration.active ?? readyRegistration.waiting ?? readyRegistration.installing;

      return {
        scope: readyRegistration.scope,
        scriptUrl: worker?.scriptURL ?? '',
      };
    });
    validateServiceWorkerRegistration(registration, baseUrl);
  } finally {
    await browser.close();
  }
};

export const verifyPwaContract = async (
  baseUrl,
  fetchImpl = fetch,
  serviceWorkerVerifier = verifyServiceWorkerRegistration,
) => {
  const appResponse = await fetchOk(fetchImpl, baseUrl);
  const appHtml = await appResponse.text();
  assert(/\bid=["']app["']/u.test(appHtml), 'App HTML is missing the app root element.');

  const manifestUrl = new URL(findManifestHref(appHtml), baseUrl);
  const manifestResponse = await fetchOk(fetchImpl, manifestUrl);
  let manifest;
  try {
    manifest = JSON.parse(await manifestResponse.text());
  } catch {
    throw new Error('Deployed manifest is not valid JSON.');
  }

  assert(typeof manifest.name === 'string' && manifest.name.trim(), 'Manifest name is missing.');
  assert(
    typeof manifest.short_name === 'string' && manifest.short_name.trim(),
    'Manifest short_name is missing.',
  );
  assert(
    INSTALLABLE_DISPLAYS.has(manifest.display),
    'Manifest display must be fullscreen, minimal-ui, or standalone.',
  );
  assert(
    typeof manifest.start_url === 'string' && manifest.start_url.trim(),
    'Manifest start_url is missing.',
  );
  assert(typeof manifest.scope === 'string' && manifest.scope.trim(), 'Manifest scope is missing.');

  assertManifestRoute(manifest.start_url, 'start_url', baseUrl);
  assertManifestRoute(manifest.scope, 'scope', baseUrl);

  const iconUrls = findRequiredIconUrls(manifest, baseUrl);
  await Promise.all(iconUrls.map((iconUrl) => fetchOk(fetchImpl, iconUrl)));
  await fetchOk(fetchImpl, new URL('sw.js', baseUrl));
  await serviceWorkerVerifier(baseUrl);

  return {
    passed: true,
    checks: [
      'HTTPS route',
      'installable manifest',
      'route-correct manifest scope',
      'registered service worker scope',
      'any and maskable 192px and 512px icons',
    ],
  };
};

const runLighthouse = (targetUrl, outputDirectory, runNumber) => {
  const outputPath = path.join(outputDirectory, `run-${runNumber}`);
  const result = spawnSync(
    process.execPath,
    [
      lighthouseCliPath,
      targetUrl.toString(),
      '--output=html',
      '--output=json',
      `--output-path=${outputPath}`,
      `--only-categories=${LIGHTHOUSE_CATEGORIES.join(',')}`,
      '--form-factor=mobile',
      '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage',
      '--quiet',
    ],
    {
      env: process.env,
      stdio: 'inherit',
    },
  );

  assert(
    result.status === 0,
    `Lighthouse run ${runNumber} failed with exit code ${result.status}.`,
  );
  const reportPath = `${outputPath}.report.json`;
  assert(fs.existsSync(reportPath), `Lighthouse run ${runNumber} did not create ${reportPath}.`);
  const report = readJson(reportPath, `Lighthouse run ${runNumber}`);
  assert(!report.runtimeError, `Lighthouse run ${runNumber} reported a runtime error.`);
  return report;
};

const writeSummary = (outputDirectory, summary, evaluation) => {
  fs.writeFileSync(path.join(outputDirectory, 'summary.md'), summary);
  if (evaluation) {
    fs.writeFileSync(
      path.join(outputDirectory, 'summary.json'),
      JSON.stringify(evaluation, null, 2),
    );
  }
  const githubSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (githubSummaryPath) {
    fs.appendFileSync(githubSummaryPath, summary);
  }
  process.stdout.write(summary);
};

export const main = async (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  const configPath = path.resolve(process.cwd(), args.budgetConfig);
  const outputDirectory = path.resolve(process.cwd(), args.outputDir);
  const committedBudgetConfig = readBudgetConfig(configPath);
  const budgetConfig = {
    ...committedBudgetConfig,
    numberOfRuns: args.numberOfRuns ?? committedBudgetConfig.numberOfRuns,
  };
  fs.mkdirSync(outputDirectory, { recursive: true });

  const reports = [];
  let evaluation;
  try {
    const pwaContract = await verifyPwaContract(args.url);
    for (let runNumber = 1; runNumber <= budgetConfig.numberOfRuns; runNumber += 1) {
      reports.push(runLighthouse(args.url, outputDirectory, runNumber));
    }
    evaluation = evaluateReports(reports, budgetConfig, pwaContract);
    const summary = renderSummary({
      targetUrl: args.url.toString(),
      reportCount: reports.length,
      evaluation,
    });
    writeSummary(outputDirectory, summary, evaluation);
    assert(evaluation.passed, 'Lighthouse release thresholds were not met.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!evaluation) {
      writeSummary(
        outputDirectory,
        renderSummary({
          targetUrl: args.url.toString(),
          reportCount: reports.length,
          evaluation: null,
          errorMessage: message,
        }),
        null,
      );
    }
    throw error;
  }
};

const isCliInvocation =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCliInvocation) {
  main().catch((error) => {
    console.error(`[lighthouse-ci] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
