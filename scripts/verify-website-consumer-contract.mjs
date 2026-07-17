#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ARGS = new Set(['producerRepo']);
const REQUIRED_PAYLOAD_FIELDS = ['commitSha', 'deployRunId', 'qualityRunId', 'artifactName'];
const REQUIRED_CONTRACT_MARKERS = [
  'repository_dispatch',
  'conspectus-mobile-production-ready',
  'actions/runs/${DEPLOY_RUN_ID}',
  'validate-conspectus-deploy-metadata.mjs',
  'validate-conspectus-security-headers.mjs',
  'verify-conspectus-staging-response.mjs',
  'verify-conspectus-live-response.mjs',
  'EXPECTED_BASE_PATH: /conspectus/',
  'https://jon2050.de/conspectus/',
  '${incoming_dir}/.htaccess',
  '${incoming_dir}/index.html',
  './www/conspectus.__incoming/',
  'mv ./www/conspectus.__incoming ./www/conspectus',
  'mv ./www/conspectus.__backup ./www/conspectus',
];
const EXPECTED_PUBLIC_CONTRACT = Object.freeze({
  schemaVersion: 1,
  eventType: 'conspectus-mobile-production-ready',
  requiredPayloadFields: ['commitSha', 'deployRunId', 'qualityRunId', 'artifactName'],
  basePath: '/conspectus/',
  stagingBaseUrl: 'https://jon2050.de/conspectus.__incoming/',
  liveBaseUrl: 'https://jon2050.de/conspectus/',
  stagingDirectory: './www/conspectus.__incoming',
  liveDirectory: './www/conspectus',
  backupDirectory: './www/conspectus.__backup',
  promotionMode: 'atomic-directory-swap',
  rollbackMode: 'restore-backup-directory',
});

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseArgs = (argv) => {
  const args = {
    contractJson: '',
    workflowJson: '',
    producerRepo: '',
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

  assert(
    Boolean(args.contractJson) !== Boolean(args.workflowJson),
    'Provide exactly one of --contract-json or --workflow-json.',
  );

  return args;
};

const verifyPublicContract = (contract, expectedProducerRepo) => {
  assert(contract && typeof contract === 'object', 'Consumer contract must be a JSON object.');
  const expectedFields = ['producerRepo', ...Object.keys(EXPECTED_PUBLIC_CONTRACT)].sort();
  const actualFields = Object.keys(contract).sort();
  assert(
    JSON.stringify(actualFields) === JSON.stringify(expectedFields),
    'Consumer contract fields must exactly match the versioned schema.',
  );
  assert(
    contract.producerRepo === expectedProducerRepo,
    `Consumer contract producerRepo must be "${expectedProducerRepo}".`,
  );

  for (const [field, expectedValue] of Object.entries(EXPECTED_PUBLIC_CONTRACT)) {
    const actualValue = contract[field];
    if (Array.isArray(expectedValue)) {
      assert(
        Array.isArray(actualValue) && JSON.stringify(actualValue) === JSON.stringify(expectedValue),
        `Consumer contract ${field} mismatch.`,
      );
      continue;
    }
    assert(
      actualValue === expectedValue,
      `Consumer contract ${field} must be ${JSON.stringify(expectedValue)}.`,
    );
  }
};

const readJson = (filePath) => {
  const absolutePath = path.resolve(process.cwd(), filePath);
  assert(fs.existsSync(absolutePath), `Missing expected file: ${absolutePath}`);
  const rawContent = fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(rawContent);
};

const decodeWorkflowYaml = (contentsResponse) => {
  assert(
    typeof contentsResponse?.content === 'string' && contentsResponse.content.trim().length > 0,
    'GitHub contents response is missing base64 workflow content.',
  );

  const encoding = String(contentsResponse.encoding ?? 'base64').toLowerCase();
  assert(
    encoding === 'base64',
    `Unsupported workflow content encoding "${contentsResponse.encoding}". Expected "base64".`,
  );

  const normalizedContent = contentsResponse.content.replace(/\s+/g, '');
  assert(normalizedContent.length > 0, 'Workflow content cannot be empty.');

  const decodedWorkflow = Buffer.from(normalizedContent, 'base64').toString('utf8');
  assert(
    decodedWorkflow.trim().length > 0,
    'Decoded workflow content is empty after base64 decoding.',
  );

  return decodedWorkflow;
};

const verifyConsumerContract = (workflowYaml, expectedProducerRepo) => {
  assert(
    workflowYaml.includes(`PRODUCER_REPO: ${expectedProducerRepo}`),
    `Consumer workflow PRODUCER_REPO must be "${expectedProducerRepo}".`,
  );

  for (const marker of REQUIRED_CONTRACT_MARKERS) {
    assert(
      workflowYaml.includes(marker),
      `Consumer workflow is missing required contract marker "${marker}".`,
    );
  }

  for (const payloadField of REQUIRED_PAYLOAD_FIELDS) {
    const payloadMarker = `github.event.client_payload.${payloadField}`;
    assert(
      workflowYaml.includes(payloadMarker),
      `Consumer workflow is missing dispatch payload field "${payloadMarker}".`,
    );
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.contractJson) {
    verifyPublicContract(readJson(args.contractJson), args.producerRepo);
  } else {
    const contentsResponse = readJson(args.workflowJson);
    const workflowYaml = decodeWorkflowYaml(contentsResponse);
    verifyConsumerContract(workflowYaml, args.producerRepo);
  }

  console.log(
    `[verify-website-consumer-contract] verified /conspectus/ consumer handoff contract for producer repo "${args.producerRepo}".`,
  );
};

main();
