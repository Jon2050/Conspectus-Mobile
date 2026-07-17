#!/usr/bin/env node

// Runs the production smoke monitor and persists the minimum state needed for repeated-failure alerts.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { runSmokeChecks } from './verify-production-deploy-smoke.mjs';

const EXPECTED_BASE_PATH = '/conspectus/';
const ALERT_THRESHOLD = 2;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizeBaseUrl = (value) => {
  const url = new URL(value);
  assert(url.protocol === 'https:', 'Monitor base URL must use HTTPS.');
  assert(
    url.pathname === EXPECTED_BASE_PATH,
    `Monitor base URL must use ${EXPECTED_BASE_PATH}; got ${url.pathname}.`,
  );
  url.search = '';
  url.hash = '';
  return url.toString();
};

const parseBoolean = (value, argumentName) => {
  assert(value === 'true' || value === 'false', `${argumentName} must be true or false.`);
  return value === 'true';
};

export const parseArgs = (argv) => {
  const rawArgs = {
    baseUrl: '',
    stateJson: '.post-deploy-monitor/state.json',
    outputJson: '.post-deploy-monitor/result.json',
    simulateFailure: 'false',
    requestTimeoutMs: '10000',
    deadlineSeconds: '60',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }
    const key = current.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in rawArgs)) {
      continue;
    }
    rawArgs[key] = argv[index + 1] ?? '';
    index += 1;
  }

  assert(rawArgs.baseUrl, 'Missing required --base-url argument.');
  const requestTimeoutMs = Number(rawArgs.requestTimeoutMs);
  const deadlineSeconds = Number(rawArgs.deadlineSeconds);
  assert(
    Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0,
    '--request-timeout-ms must be a positive integer.',
  );
  assert(
    Number.isInteger(deadlineSeconds) && deadlineSeconds > 0,
    '--deadline-seconds must be a positive integer.',
  );

  return {
    baseUrl: normalizeBaseUrl(rawArgs.baseUrl),
    stateJson: rawArgs.stateJson,
    outputJson: rawArgs.outputJson,
    simulateFailure: parseBoolean(rawArgs.simulateFailure, '--simulate-failure'),
    requestTimeoutMs,
    deadlineSeconds,
  };
};

const defaultState = () => ({
  schemaVersion: 1,
  consecutiveFailures: 0,
  lastKnownSuccess: null,
});

const readState = (statePath) => {
  if (!fs.existsSync(statePath)) {
    return defaultState();
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert(state?.schemaVersion === 1, 'Monitor state schemaVersion must be 1.');
  assert(
    Number.isInteger(state.consecutiveFailures) && state.consecutiveFailures >= 0,
    'Monitor state consecutiveFailures must be a non-negative integer.',
  );
  return state;
};

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const fetchTextWithTimeout = async (fetchImpl, url, requestTimeoutMs) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    assert(response.status === 200, `${new URL(url).pathname} returned HTTP ${response.status}.`);
    return await response.text();
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const readLiveIdentity = async (options, fetchImpl) => {
  const metadataUrl = new URL('deploy-metadata.json', options.baseUrl);
  metadataUrl.searchParams.set('monitor-probe', Date.now().toString());
  const metadata = JSON.parse(
    await fetchTextWithTimeout(fetchImpl, metadataUrl, options.requestTimeoutMs),
  );
  assert(metadata.channel === 'production', 'Live deploy metadata channel must be production.');
  assert(
    metadata.basePath === EXPECTED_BASE_PATH,
    `Live deploy metadata basePath must be ${EXPECTED_BASE_PATH}.`,
  );
  assert(
    typeof metadata.commitSha === 'string' && /^[0-9a-f]{40}$/u.test(metadata.commitSha),
    'Live deploy metadata commitSha must be a full lowercase Git SHA.',
  );
  assert(
    /^\d+$/u.test(String(metadata.deployRunId)),
    'Live deploy metadata deployRunId must be numeric.',
  );
  assert(
    /^\d+$/u.test(String(metadata.qualityRunId)),
    'Live deploy metadata qualityRunId must be numeric.',
  );
  return {
    commitSha: metadata.commitSha,
    deployRunId: String(metadata.deployRunId),
    qualityRunId: String(metadata.qualityRunId),
  };
};

const buildMonitorRunUrl = (environment) => {
  const serverUrl = environment.GITHUB_SERVER_URL;
  const repository = environment.GITHUB_REPOSITORY;
  const runId = environment.GITHUB_RUN_ID;
  return serverUrl && repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : '';
};

export const runPostDeployMonitor = async (options, dependencies = {}) => {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const smokeImpl = dependencies.smokeImpl ?? runSmokeChecks;
  const now = dependencies.now ?? (() => new Date());
  const environment = dependencies.environment ?? process.env;
  const previousState = readState(options.stateJson);
  const checkedAt = now().toISOString();
  let observedIdentity = null;
  let error = '';

  try {
    observedIdentity = await readLiveIdentity(options, fetchImpl);
    await smokeImpl(
      {
        baseUrl: options.baseUrl,
        commitSha: observedIdentity.commitSha,
        deployRunId: observedIdentity.deployRunId,
        maxAttempts: 2,
        retryDelaySeconds: 5,
        requestTimeoutMs: options.requestTimeoutMs,
        deadlineSeconds: options.deadlineSeconds,
      },
      fetchImpl,
    );
    if (options.simulateFailure) {
      throw new Error('Controlled monitor failure requested by workflow_dispatch.');
    }
  } catch (monitorError) {
    error = monitorError instanceof Error ? monitorError.message : String(monitorError);
  }

  const status = error ? 'failure' : 'success';
  const lastKnownSuccess =
    status === 'success'
      ? { ...observedIdentity, observedAt: checkedAt }
      : previousState.lastKnownSuccess;
  const consecutiveFailures = status === 'failure' ? previousState.consecutiveFailures + 1 : 0;
  const state = {
    schemaVersion: 1,
    consecutiveFailures,
    lastKnownSuccess,
  };
  const result = {
    schemaVersion: 1,
    status,
    checkedAt,
    baseUrl: options.baseUrl,
    simulated: options.simulateFailure,
    consecutiveFailures,
    alertThreshold: ALERT_THRESHOLD,
    alertRequired: consecutiveFailures >= ALERT_THRESHOLD,
    observedIdentity,
    lastKnownSuccess,
    triageIdentity: observedIdentity ?? lastKnownSuccess,
    error,
    monitorRunUrl: buildMonitorRunUrl(environment),
  };

  writeJson(options.stateJson, state);
  writeJson(options.outputJson, result);
  console.log(
    `[post-deploy-monitor] status=${status} consecutiveFailures=${consecutiveFailures} commitSha=${result.triageIdentity?.commitSha ?? 'unknown'} deployRunId=${result.triageIdentity?.deployRunId ?? 'unknown'}`,
  );
  return result;
};

export const main = async (argv = process.argv.slice(2)) => {
  await runPostDeployMonitor(parseArgs(argv));
};

const isCliInvocation =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCliInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
