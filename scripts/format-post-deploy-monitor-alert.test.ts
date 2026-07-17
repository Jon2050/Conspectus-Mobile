// Verifies that monitor incident messages contain actionable deploy and artifact identity.
import { describe, expect, it } from 'vitest';
import { formatMonitorAlert } from './format-post-deploy-monitor-alert.mjs';
import type { MonitorResult } from './run-post-deploy-monitor.mjs';

const commitSha = 'b'.repeat(40);
const triageIdentity = {
  commitSha,
  deployRunId: '12345',
  qualityRunId: '12340',
};
const result: MonitorResult = {
  schemaVersion: 1,
  status: 'failure',
  checkedAt: '2026-07-17T12:00:00.000Z',
  baseUrl: 'https://jon2050.de/conspectus/',
  simulated: false,
  consecutiveFailures: 2,
  alertThreshold: 2,
  alertRequired: true,
  observedIdentity: triageIdentity,
  lastKnownSuccess: { ...triageIdentity, observedAt: '2026-07-17T11:30:00.000Z' },
  error: 'manifest returned HTTP 503',
  monitorRunUrl: 'https://github.com/Jon2050/Conspectus-Mobile/actions/runs/777',
  triageIdentity,
};

describe('post-deploy monitor alert formatting', () => {
  it('includes the repeated failure, monitor run, deploy run, and source artifact', () => {
    const message = formatMonitorAlert(result, 'failure', 'Jon2050/Conspectus-Mobile');

    expect(message).toContain('Repeated production smoke failure');
    expect(message).toContain('consecutive failures: **2**');
    expect(message).toContain(`\`commitSha\`: \`${commitSha}\``);
    expect(message).toContain(
      '[12345](https://github.com/Jon2050/Conspectus-Mobile/actions/runs/12345)',
    );
    expect(message).toContain(
      `[\`conspectus-mobile-production-${commitSha}\`](https://github.com/Jon2050/Conspectus-Mobile/actions/runs/12345#artifacts)`,
    );
    expect(message).toContain('/actions/runs/777');
  });

  it('formats a recovery comment with the restored live identity', () => {
    const message = formatMonitorAlert(
      { ...result, status: 'success', consecutiveFailures: 0, error: '' },
      'recovery',
      'Jon2050/Conspectus-Mobile',
    );

    expect(message).toContain('Production smoke recovered');
    expect(message).toContain('consecutive failures reset to **0**');
    expect(message).toContain(commitSha);
  });
});
