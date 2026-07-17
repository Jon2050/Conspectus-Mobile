// Covers deterministic production rollback target validation and fail-closed rejection cases.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptsDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const verifierPath = path.resolve(scriptsDirectoryPath, 'verify-rollback-target.mjs');

const createFixture = (overrides = {}) => {
  const fixturePath = mkdtempSync(path.join(tmpdir(), 'verify-rollback-target-'));
  const paths = {
    run: path.join(fixturePath, 'run.json'),
    artifacts: path.join(fixturePath, 'artifacts.json'),
    metadata: path.join(fixturePath, 'deploy-metadata.json'),
  };
  const values = {
    run: {
      id: 2002,
      head_sha: 'abc123',
      head_branch: 'main',
      conclusion: 'success',
      path: '.github/workflows/deploy-production.yml',
      event: 'workflow_dispatch',
    },
    artifacts: {
      artifacts: [
        { name: 'conspectus-mobile-production-abc123', expired: false },
        { name: 'lighthouse-production-abc123', expired: false },
      ],
    },
    metadata: {
      channel: 'production',
      basePath: '/',
      sourceBranch: 'main',
      commitSha: 'abc123',
      qualityRunId: '1001',
      deployRunId: '2002',
    },
    ...overrides,
  };

  writeFileSync(paths.run, JSON.stringify(values.run));
  writeFileSync(paths.artifacts, JSON.stringify(values.artifacts));
  writeFileSync(paths.metadata, JSON.stringify(values.metadata));

  return { fixturePath, paths };
};

const runVerifier = (paths: { run: string; artifacts: string; metadata: string }) =>
  spawnSync(
    'node',
    [
      verifierPath,
      '--run-json',
      paths.run,
      '--artifacts-json',
      paths.artifacts,
      '--metadata',
      paths.metadata,
      '--commit-sha',
      'abc123',
      '--deploy-run-id',
      '2002',
    ],
    { cwd: repositoryRootPath, encoding: 'utf8' },
  );

describe('verify-rollback-target script', () => {
  it('accepts one unexpired production artifact and ignores unrelated run artifacts', () => {
    const fixture = createFixture();

    try {
      const result = runVerifier(fixture.paths);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('commitSha=abc123 deployRunId=2002 verified artifact');
    } finally {
      rmSync(fixture.fixturePath, { force: true, recursive: true });
    }
  });

  it('rejects a run that did not successfully complete from main', () => {
    const fixture = createFixture({
      run: {
        id: 2002,
        head_sha: 'abc123',
        head_branch: 'feature/test',
        conclusion: 'failure',
        path: '.github/workflows/deploy-production.yml',
        event: 'workflow_dispatch',
      },
    });

    try {
      const result = runVerifier(fixture.paths);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must originate from main');
    } finally {
      rmSync(fixture.fixturePath, { force: true, recursive: true });
    }
  });

  it('rejects a missing or expired exact production artifact', () => {
    const fixture = createFixture({
      artifacts: {
        artifacts: [{ name: 'conspectus-mobile-production-abc123', expired: true }],
      },
    });

    try {
      const result = runVerifier(fixture.paths);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('is expired');
    } finally {
      rmSync(fixture.fixturePath, { force: true, recursive: true });
    }
  });

  it('rejects a successful main run from another workflow', () => {
    const fixture = createFixture({
      run: {
        id: 2002,
        head_sha: 'abc123',
        head_branch: 'main',
        conclusion: 'success',
        path: '.github/workflows/quality.yml',
        event: 'push',
      },
    });

    try {
      const result = runVerifier(fixture.paths);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must use ".github/workflows/deploy-production.yml"');
    } finally {
      rmSync(fixture.fixturePath, { force: true, recursive: true });
    }
  });

  it('rejects rollback metadata that does not match the requested identity', () => {
    const fixture = createFixture({
      metadata: {
        channel: 'production',
        basePath: '/',
        sourceBranch: 'main',
        commitSha: 'wrong-sha',
        qualityRunId: '1001',
        deployRunId: '2002',
      },
    });

    try {
      const result = runVerifier(fixture.paths);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Rollback metadata commit mismatch');
    } finally {
      rmSync(fixture.fixturePath, { force: true, recursive: true });
    }
  });
});
