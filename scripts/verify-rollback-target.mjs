#!/usr/bin/env node

// Verifies that a historical production run and artifact are safe deterministic rollback inputs.
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ARGS = new Set(['runJson', 'artifactsJson', 'metadata', 'commitSha', 'deployRunId']);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseArgs = (argv) => {
  const args = {
    runJson: '',
    artifactsJson: '',
    metadata: '',
    commitSha: '',
    deployRunId: '',
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

  return args;
};

const readJson = (filePath) => {
  const absolutePath = path.resolve(process.cwd(), filePath);
  assert(fs.existsSync(absolutePath), `Missing expected file: ${absolutePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, ''));
};

const verifyRun = (run, expected) => {
  assert(
    String(run.id) === expected.deployRunId,
    `Producer run id mismatch. Expected "${expected.deployRunId}", got "${run.id}".`,
  );
  assert(
    String(run.head_sha) === expected.commitSha,
    `Producer run commit mismatch. Expected "${expected.commitSha}", got "${run.head_sha}".`,
  );
  assert(
    run.head_branch === 'main',
    `Producer run must originate from main; got "${run.head_branch}".`,
  );
  assert(
    run.conclusion === 'success',
    `Producer run must be completed successfully; got "${run.conclusion}".`,
  );
  assert(
    run.path === '.github/workflows/deploy-production.yml',
    `Producer run must use ".github/workflows/deploy-production.yml"; got "${run.path}".`,
  );
  assert(
    run.event === 'workflow_dispatch',
    `Producer run must use the "workflow_dispatch" event; got "${run.event}".`,
  );
};

const verifyArtifact = (artifactsResponse, expectedArtifactName) => {
  const artifacts = Array.isArray(artifactsResponse.artifacts) ? artifactsResponse.artifacts : [];
  const matches = artifacts.filter((artifact) => artifact?.name === expectedArtifactName);

  assert(
    matches.length === 1,
    `Expected exactly one rollback artifact named "${expectedArtifactName}", found ${matches.length}.`,
  );
  assert(matches[0].expired !== true, `Rollback artifact "${expectedArtifactName}" is expired.`);
};

const verifyMetadata = (metadata, expected) => {
  assert(metadata.channel === 'production', 'Rollback metadata channel must be "production".');
  assert(
    metadata.basePath === '/conspectus/',
    'Rollback metadata basePath must be "/conspectus/".',
  );
  assert(metadata.sourceBranch === 'main', 'Rollback metadata sourceBranch must be "main".');
  assert(
    String(metadata.commitSha) === expected.commitSha,
    `Rollback metadata commit mismatch. Expected "${expected.commitSha}", got "${metadata.commitSha}".`,
  );
  assert(
    String(metadata.deployRunId) === expected.deployRunId,
    `Rollback metadata deploy run mismatch. Expected "${expected.deployRunId}", got "${metadata.deployRunId}".`,
  );
  assert(
    String(metadata.qualityRunId ?? '').trim().length > 0,
    'Rollback metadata qualityRunId is required.',
  );
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const expected = {
    commitSha: args.commitSha,
    deployRunId: args.deployRunId,
  };
  const artifactName = `conspectus-mobile-production-${args.commitSha}`;

  verifyRun(readJson(args.runJson), expected);
  verifyArtifact(readJson(args.artifactsJson), artifactName);
  verifyMetadata(readJson(args.metadata), expected);

  console.log(
    `[verify-rollback-target] commitSha=${args.commitSha} deployRunId=${args.deployRunId} verified artifact "${artifactName}".`,
  );
};

main();
