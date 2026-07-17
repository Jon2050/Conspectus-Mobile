// Verifies scheduling, durable failure state, incident lifecycle, and evidence in the monitor workflow.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workflowSource = fs.readFileSync(
  path.resolve(currentDirectory, '../.github/workflows/post-deploy-monitor.yml'),
  'utf8',
);

describe('post-deploy monitor workflow contract', () => {
  it('runs twice hourly and supports controlled failure testing', () => {
    expect(workflowSource).toContain("cron: '7,37 * * * *'");
    expect(workflowSource).toContain('workflow_dispatch:');
    expect(workflowSource).toContain('simulate_failure:');
    expect(workflowSource).toContain('--simulate-failure "${SIMULATE_FAILURE}"');
  });

  it('serializes runs and persists state before the final failure step', () => {
    expect(workflowSource).toContain('group: post-deploy-production-monitor');
    expect(workflowSource).toContain('cancel-in-progress: false');
    expect(workflowSource).toContain('actions/cache/restore@');
    expect(workflowSource).toContain('actions/cache/save@');
    expect(workflowSource).toContain(
      'key: post-deploy-monitor-state-${{ github.run_id }}-${{ github.run_attempt }}',
    );
    expect(workflowSource.indexOf('name: Save consecutive-failure state')).toBeLessThan(
      workflowSource.indexOf('name: Fail when production smoke failed'),
    );
  });

  it('rejects non-main manual runs before restoring shared state or mutating incidents', () => {
    const branchGuardIndex = workflowSource.indexOf('name: Require main branch');
    const restoreIndex = workflowSource.indexOf('name: Restore consecutive-failure state');
    const incidentIndex = workflowSource.indexOf('name: Open, update, or close monitor incident');

    expect(workflowSource).toContain('Post-Deploy Monitor may only run from main.');
    expect(branchGuardIndex).toBeGreaterThan(-1);
    expect(branchGuardIndex).toBeLessThan(restoreIndex);
    expect(branchGuardIndex).toBeLessThan(incidentIndex);
  });

  it('uses body files for one repeated-failure incident and recovery lifecycle', () => {
    expect(workflowSource).toContain('issues: write');
    expect(workflowSource).toContain("INCIDENT_TITLE: '[M8-10 Monitor] Production smoke failing'");
    expect(workflowSource).toContain("'.alertRequired'");
    expect(workflowSource).toContain('gh issue create');
    expect(workflowSource).toContain('gh issue comment');
    expect(workflowSource).toContain('gh issue close');
    expect(workflowSource).toContain('--body-file .post-deploy-monitor/incident-message.md');
    expect(workflowSource).not.toMatch(/gh issue (?:create|comment)[^\n]*--body\s/u);
  });

  it('retains machine-readable evidence for deploy identity triage', () => {
    expect(workflowSource).toContain('scripts/run-post-deploy-monitor.mjs');
    expect(workflowSource).toContain('scripts/format-post-deploy-monitor-alert.mjs');
    expect(workflowSource).toContain('post-deploy-monitor-${{ github.run_id }}');
    expect(workflowSource).toContain('include-hidden-files: true');
    expect(workflowSource).toContain('retention-days: 30');
  });
});
