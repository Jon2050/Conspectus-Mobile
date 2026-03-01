import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(thisFilePath);
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const verifyScriptPath = path.resolve(scriptsDirectoryPath, 'verify-production-handoff.mjs');

const createFixtureDirectory = () => mkdtempSync(path.join(tmpdir(), 'verify-production-handoff-'));

const writeJson = (filePath: string, value: unknown) => {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const runVerifier = (args: string[]) =>
  spawnSync('node', [verifyScriptPath, ...args], {
    cwd: repositoryRootPath,
    encoding: 'utf8',
  });

const runVerifierOrThrow = (args: string[]) => {
  const result = runVerifier(args);
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Expected verifier to succeed, but it failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  return result;
};

const runVerifierFailure = (args: string[]) => {
  const result = runVerifier(args);
  if (result.error) {
    throw result.error;
  }

  expect(result.status).toBe(1);
  return result;
};

describe('verify-production-handoff script', () => {
  it('accepts a valid single-artifact handoff with traceable metadata', () => {
    const fixturePath = createFixtureDirectory();
    const artifactsPath = path.join(fixturePath, 'artifacts.json');
    const metadataPath = path.join(fixturePath, 'deploy-metadata.json');
    const artifactName = 'conspectus-mobile-production-abc123';

    try {
      writeJson(artifactsPath, {
        artifacts: [{ name: artifactName }],
      });
      writeJson(metadataPath, {
        channel: 'production',
        basePath: '/conspectus/webapp/',
        sourceBranch: 'main',
        commitSha: 'abc123',
        buildTimeUtc: '2026-03-01T10:20:30Z',
        qualityRunId: '1001',
        deployRunId: '2002',
      });

      const result = runVerifierOrThrow([
        '--artifacts-json',
        artifactsPath,
        '--metadata',
        metadataPath,
        '--artifact-name',
        artifactName,
        '--commit-sha',
        'abc123',
        '--quality-run-id',
        '1001',
        '--deploy-run-id',
        '2002',
      ]);

      expect(result.stdout).toContain('[verify-production-handoff] verified artifact');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when more than one artifact is present for the deploy run', () => {
    const fixturePath = createFixtureDirectory();
    const artifactsPath = path.join(fixturePath, 'artifacts.json');
    const metadataPath = path.join(fixturePath, 'deploy-metadata.json');
    const artifactName = 'conspectus-mobile-production-abc123';

    try {
      writeJson(artifactsPath, {
        artifacts: [{ name: artifactName }, { name: 'unexpected-artifact' }],
      });
      writeJson(metadataPath, {
        channel: 'production',
        basePath: '/conspectus/webapp/',
        sourceBranch: 'main',
        commitSha: 'abc123',
        buildTimeUtc: '2026-03-01T10:20:30Z',
        qualityRunId: '1001',
        deployRunId: '2002',
      });

      const result = runVerifierFailure([
        '--artifacts-json',
        artifactsPath,
        '--metadata',
        metadataPath,
        '--artifact-name',
        artifactName,
        '--commit-sha',
        'abc123',
        '--quality-run-id',
        '1001',
        '--deploy-run-id',
        '2002',
      ]);

      expect(result.stderr).toContain(
        'Expected exactly one artifact for this deploy run, found 2.',
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when traceability identifiers do not match expected values', () => {
    const fixturePath = createFixtureDirectory();
    const artifactsPath = path.join(fixturePath, 'artifacts.json');
    const metadataPath = path.join(fixturePath, 'deploy-metadata.json');
    const artifactName = 'conspectus-mobile-production-abc123';

    try {
      writeJson(artifactsPath, {
        artifacts: [{ name: artifactName }],
      });
      writeJson(metadataPath, {
        channel: 'production',
        basePath: '/conspectus/webapp/',
        sourceBranch: 'main',
        commitSha: 'wrong-sha',
        buildTimeUtc: '2026-03-01T10:20:30Z',
        qualityRunId: '1001',
        deployRunId: '2002',
      });

      const result = runVerifierFailure([
        '--artifacts-json',
        artifactsPath,
        '--metadata',
        metadataPath,
        '--artifact-name',
        artifactName,
        '--commit-sha',
        'abc123',
        '--quality-run-id',
        '1001',
        '--deploy-run-id',
        '2002',
      ]);

      expect(result.stderr).toContain(
        'Metadata commitSha mismatch. Expected "abc123", got "wrong-sha".',
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });
});
