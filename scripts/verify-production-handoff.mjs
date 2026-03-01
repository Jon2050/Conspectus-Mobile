#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ARGS = new Set([
  'artifactsJson',
  'metadata',
  'artifactName',
  'commitSha',
  'qualityRunId',
  'deployRunId',
]);

const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseArgs = (argv) => {
  const args = {
    artifactsJson: '',
    metadata: '',
    artifactName: '',
    commitSha: '',
    qualityRunId: '',
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

  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
};

const verifyArtifacts = (artifactsResponse, expectedArtifactName) => {
  const artifacts = Array.isArray(artifactsResponse.artifacts) ? artifactsResponse.artifacts : [];
  assert(
    artifacts.length === 1,
    `Expected exactly one artifact for this deploy run, found ${artifacts.length}.`,
  );

  const artifact = artifacts[0];
  assert(
    artifact.name === expectedArtifactName,
    `Artifact name mismatch. Expected "${expectedArtifactName}", got "${artifact.name}".`,
  );
};

const verifyMetadata = (metadata, expectedValues) => {
  assert(
    metadata.channel === 'production',
    `Metadata channel mismatch. Expected "production", got "${metadata.channel}".`,
  );
  assert(
    metadata.basePath === '/conspectus/webapp/',
    `Metadata basePath mismatch. Expected "/conspectus/webapp/", got "${metadata.basePath}".`,
  );
  assert(metadata.sourceBranch, 'Metadata sourceBranch is required.');
  assert(
    metadata.commitSha === expectedValues.commitSha,
    `Metadata commitSha mismatch. Expected "${expectedValues.commitSha}", got "${metadata.commitSha}".`,
  );
  assert(
    ISO_UTC_TIMESTAMP_PATTERN.test(String(metadata.buildTimeUtc)),
    `Metadata buildTimeUtc must use ISO UTC format (YYYY-MM-DDTHH:mm:ssZ). Got "${metadata.buildTimeUtc}".`,
  );
  assert(
    String(metadata.qualityRunId) === expectedValues.qualityRunId,
    `Metadata qualityRunId mismatch. Expected "${expectedValues.qualityRunId}", got "${metadata.qualityRunId}".`,
  );
  assert(
    String(metadata.deployRunId) === expectedValues.deployRunId,
    `Metadata deployRunId mismatch. Expected "${expectedValues.deployRunId}", got "${metadata.deployRunId}".`,
  );
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const artifactsResponse = readJson(args.artifactsJson);
  const metadata = readJson(args.metadata);

  verifyArtifacts(artifactsResponse, args.artifactName);
  verifyMetadata(metadata, {
    commitSha: args.commitSha,
    qualityRunId: args.qualityRunId,
    deployRunId: args.deployRunId,
  });

  console.log(
    `[verify-production-handoff] verified artifact "${args.artifactName}" and deploy metadata traceability.`,
  );
};

main();
