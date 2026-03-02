#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const REQUIRED_ARGS = new Set(['baseUrl', 'commitSha', 'deployRunId']);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizeBaseUrl = (value) => {
  const trimmedValue = value.trim();
  assert(trimmedValue.length > 0, 'Missing required --base-url argument.');
  assert(
    trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://'),
    `Invalid --base-url value "${trimmedValue}". Use an absolute http/https URL.`,
  );
  return trimmedValue.endsWith('/') ? trimmedValue : `${trimmedValue}/`;
};

export const parseArgs = (argv) => {
  const args = {
    baseUrl: '',
    commitSha: '',
    deployRunId: '',
    maxAttempts: '24',
    retryDelaySeconds: '10',
    requestTimeoutMs: '10000',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!(key in args)) {
      continue;
    }

    args[key] = argv[index + 1] ?? '';
    index += 1;
  }

  for (const requiredArg of REQUIRED_ARGS) {
    assert(args[requiredArg], `Missing required --${requiredArg} argument.`);
  }

  const maxAttempts = Number(args.maxAttempts);
  const retryDelaySeconds = Number(args.retryDelaySeconds);
  const requestTimeoutMs = Number(args.requestTimeoutMs);

  assert(
    Number.isInteger(maxAttempts) && maxAttempts > 0,
    '--max-attempts must be a positive integer.',
  );
  assert(
    Number.isInteger(retryDelaySeconds) && retryDelaySeconds >= 0,
    '--retry-delay-seconds must be a non-negative integer.',
  );
  assert(
    Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0,
    '--request-timeout-ms must be a positive integer.',
  );

  return {
    baseUrl: normalizeBaseUrl(args.baseUrl),
    commitSha: args.commitSha,
    deployRunId: args.deployRunId,
    maxAttempts,
    retryDelaySeconds,
    requestTimeoutMs,
  };
};

const buildContextLabel = ({ commitSha, deployRunId }) =>
  `commitSha=${commitSha} deployRunId=${deployRunId}`;

const ensureBootstrapMarkers = (html) => {
  assert(
    /id=["']app["']/.test(html),
    'HTML bootstrap sanity check failed: missing app root element id="app".',
  );
  assert(
    /<script\b[^>]*type=["']module["'][^>]*>/i.test(html),
    'HTML bootstrap sanity check failed: missing module bootstrap script tag.',
  );
};

const ensureDeployIdentity = (metadataText, options) => {
  let metadata;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    throw new Error('deploy-metadata is not valid JSON.');
  }

  const expectedBasePath = new URL(options.baseUrl).pathname;
  assert(
    metadata.basePath === expectedBasePath,
    `deploy-metadata basePath mismatch. Expected "${expectedBasePath}", got "${metadata.basePath}".`,
  );
  assert(
    String(metadata.commitSha) === options.commitSha,
    `deploy-metadata commitSha mismatch. Expected "${options.commitSha}", got "${metadata.commitSha}".`,
  );
  assert(
    String(metadata.deployRunId) === options.deployRunId,
    `deploy-metadata deployRunId mismatch. Expected "${options.deployRunId}", got "${metadata.deployRunId}".`,
  );
};

const fetchWithTimeout = async (fetchImpl, url, requestTimeoutMs) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,*/*;q=0.9',
      },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const createChecks = (options) => [
  {
    name: 'app-route',
    url: options.baseUrl,
    validateBody: ensureBootstrapMarkers,
  },
  {
    name: 'manifest',
    url: new URL('manifest.webmanifest', options.baseUrl).toString(),
  },
  {
    name: 'service-worker',
    url: new URL('sw.js', options.baseUrl).toString(),
  },
  {
    name: 'deploy-metadata',
    url: new URL('deploy-metadata.json', options.baseUrl).toString(),
    validateBody: (bodyText) => ensureDeployIdentity(bodyText, options),
  },
];

export const runSmokeChecks = async (options, fetchImpl = fetch, sleepImpl = delay) => {
  const contextLabel = buildContextLabel(options);
  const checks = createChecks(options);
  let lastErrors = [];

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    lastErrors = [];
    console.log(
      `[verify-production-deploy-smoke] ${contextLabel} starting attempt ${attempt}/${options.maxAttempts}.`,
    );

    for (const check of checks) {
      try {
        const response = await fetchWithTimeout(fetchImpl, check.url, options.requestTimeoutMs);
        assert(response.status === 200, `${check.name} returned HTTP ${response.status}.`);

        if (check.validateBody) {
          const bodyText = await response.text();
          check.validateBody(bodyText);
        }

        console.log(
          `[verify-production-deploy-smoke] ${contextLabel} check=${check.name} status=${response.status} url=${check.url}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const checkError = `check=${check.name} url=${check.url} error="${message}"`;
        lastErrors.push(checkError);
        console.error(`[verify-production-deploy-smoke] ${contextLabel} ${checkError}`);
      }
    }

    if (lastErrors.length === 0) {
      console.log(
        `[verify-production-deploy-smoke] ${contextLabel} all deployment smoke checks passed for ${options.baseUrl}`,
      );
      return;
    }

    if (attempt < options.maxAttempts) {
      console.log(
        `[verify-production-deploy-smoke] ${contextLabel} attempt ${attempt}/${options.maxAttempts} failed; retrying in ${options.retryDelaySeconds}s.`,
      );
      await sleepImpl(options.retryDelaySeconds * 1000);
    }
  }

  throw new Error(
    `[verify-production-deploy-smoke] ${contextLabel} failed after ${options.maxAttempts} attempt(s). Last errors: ${lastErrors.join(' | ')}`,
  );
};

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv);
  await runSmokeChecks(options);
};

const isCliInvocation =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCliInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
