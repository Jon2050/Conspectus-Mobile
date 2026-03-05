#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ARGS = new Set(['workflowJson', 'producerRepo']);
const REQUIRED_PAYLOAD_FIELDS = ['commitSha', 'deployRunId', 'qualityRunId', 'artifactName'];
const REQUIRED_CONTRACT_MARKERS = [
  'repository_dispatch',
  'conspectus-mobile-production-ready',
  'actions/runs/${DEPLOY_RUN_ID}',
  'validate-conspectus-deploy-metadata.mjs',
  'conspectus/webapp',
];

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseArgs = (argv) => {
  const args = {
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

  return args;
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
  const contentsResponse = readJson(args.workflowJson);
  const workflowYaml = decodeWorkflowYaml(contentsResponse);

  verifyConsumerContract(workflowYaml, args.producerRepo);

  console.log(
    `[verify-website-consumer-contract] verified consumer handoff contract for producer repo "${args.producerRepo}".`,
  );
};

main();
