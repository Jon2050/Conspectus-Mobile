// Verifies monitor state transitions, live identity discovery, and repeated-failure behavior.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs, runPostDeployMonitor } from './run-post-deploy-monitor.mjs';

const COMMIT_SHA = 'a'.repeat(40);
const identity = {
  commitSha: COMMIT_SHA,
  deployRunId: '12345',
  qualityRunId: '12340',
};

const createFixture = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'post-deploy-monitor-'));
  return {
    directory,
    stateJson: path.join(directory, 'state.json'),
    outputJson: path.join(directory, 'result.json'),
  };
};

const createOptions = (fixture: ReturnType<typeof createFixture>) => ({
  baseUrl: 'https://jon2050.de/conspectus/',
  stateJson: fixture.stateJson,
  outputJson: fixture.outputJson,
  simulateFailure: false,
  requestTimeoutMs: 1000,
  deadlineSeconds: 60,
});

const metadataFetch = vi.fn(
  async () =>
    new Response(
      JSON.stringify({
        channel: 'production',
        basePath: '/conspectus/',
        ...identity,
      }),
      { status: 200 },
    ),
);

const dependencies = (overrides = {}) => ({
  fetchImpl: metadataFetch as typeof fetch,
  smokeImpl: vi.fn(async () => undefined),
  now: () => new Date('2026-07-17T12:00:00.000Z'),
  environment: {
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'Jon2050/Conspectus-Mobile',
    GITHUB_RUN_ID: '777',
  },
  ...overrides,
});

const fixtures: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { force: true, recursive: true });
  }
});

describe('post-deploy production monitor', () => {
  it('records a live smoke success and resets the failure counter', async () => {
    const fixture = createFixture();
    fixtures.push(fixture.directory);
    writeFileSync(
      fixture.stateJson,
      JSON.stringify({ schemaVersion: 1, consecutiveFailures: 1, lastKnownSuccess: null }),
    );
    const smokeImpl = vi.fn(async () => undefined);

    const result = await runPostDeployMonitor(createOptions(fixture), dependencies({ smokeImpl }));

    expect(result).toMatchObject({
      status: 'success',
      consecutiveFailures: 0,
      alertRequired: false,
      observedIdentity: identity,
      triageIdentity: identity,
      monitorRunUrl: 'https://github.com/Jon2050/Conspectus-Mobile/actions/runs/777',
    });
    expect(smokeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://jon2050.de/conspectus/',
        commitSha: COMMIT_SHA,
        deployRunId: '12345',
      }),
      metadataFetch,
    );
    expect(JSON.parse(readFileSync(fixture.stateJson, 'utf8'))).toMatchObject({
      consecutiveFailures: 0,
      lastKnownSuccess: { ...identity, observedAt: '2026-07-17T12:00:00.000Z' },
    });
  });

  it('requires an alert only after two consecutive failures', async () => {
    const fixture = createFixture();
    fixtures.push(fixture.directory);
    const smokeImpl = vi.fn(async () => {
      throw new Error('manifest returned HTTP 503');
    });

    const firstResult = await runPostDeployMonitor(
      createOptions(fixture),
      dependencies({ smokeImpl }),
    );
    const secondResult = await runPostDeployMonitor(
      createOptions(fixture),
      dependencies({ smokeImpl }),
    );

    expect(firstResult).toMatchObject({
      status: 'failure',
      consecutiveFailures: 1,
      alertRequired: false,
    });
    expect(secondResult).toMatchObject({
      status: 'failure',
      consecutiveFailures: 2,
      alertRequired: true,
      observedIdentity: identity,
      triageIdentity: identity,
      error: 'manifest returned HTTP 503',
    });
  });

  it('retains the last known successful identity during a full metadata outage', async () => {
    const fixture = createFixture();
    fixtures.push(fixture.directory);
    const lastKnownSuccess = { ...identity, observedAt: '2026-07-17T11:30:00.000Z' };
    writeFileSync(
      fixture.stateJson,
      JSON.stringify({ schemaVersion: 1, consecutiveFailures: 1, lastKnownSuccess }),
    );
    const smokeImpl = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => new Response('unavailable', { status: 503 }));

    const result = await runPostDeployMonitor(
      createOptions(fixture),
      dependencies({ fetchImpl: fetchImpl as typeof fetch, smokeImpl }),
    );

    expect(result).toMatchObject({
      status: 'failure',
      consecutiveFailures: 2,
      alertRequired: true,
      observedIdentity: null,
      lastKnownSuccess,
      triageIdentity: lastKnownSuccess,
    });
    expect(result.error).toContain('deploy-metadata.json returned HTTP 503');
    expect(smokeImpl).not.toHaveBeenCalled();
  });

  it('supports controlled failure runs without skipping the real smoke check', async () => {
    const fixture = createFixture();
    fixtures.push(fixture.directory);
    const smokeImpl = vi.fn(async () => undefined);

    const result = await runPostDeployMonitor(
      { ...createOptions(fixture), simulateFailure: true },
      dependencies({ smokeImpl }),
    );

    expect(smokeImpl).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: 'failure',
      simulated: true,
      consecutiveFailures: 1,
      alertRequired: false,
      observedIdentity: identity,
    });
    expect(result.error).toContain('Controlled monitor failure');
  });

  it('parses the canonical production URL and rejects retired paths', () => {
    expect(parseArgs(['--base-url', 'https://jon2050.de/conspectus/'])).toMatchObject({
      baseUrl: 'https://jon2050.de/conspectus/',
      simulateFailure: false,
      requestTimeoutMs: 10000,
      deadlineSeconds: 60,
    });
    expect(() => parseArgs(['--base-url', 'https://jon2050.de/conspectus/webapp/'])).toThrow(
      'must use /conspectus/',
    );
  });
});
