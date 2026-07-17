#!/usr/bin/env node

// Formats monitor evidence for GitHub issue creation, updates, and recovery comments.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const identityLines = (identity, repository) => {
  if (!identity) {
    return [
      '- `commitSha`: unavailable',
      '- `deployRunId`: unavailable',
      '- source artifact: unavailable',
    ];
  }
  const deployRunUrl = `https://github.com/${repository}/actions/runs/${identity.deployRunId}`;
  const deployArtifactsUrl = `${deployRunUrl}#artifacts`;
  return [
    `- \`commitSha\`: \`${identity.commitSha}\``,
    `- \`deployRunId\`: [${identity.deployRunId}](${deployRunUrl})`,
    `- \`qualityRunId\`: \`${identity.qualityRunId}\``,
    `- source artifact: [\`conspectus-mobile-production-${identity.commitSha}\`](${deployArtifactsUrl})`,
  ];
};

export const formatMonitorAlert = (result, kind, repository) => {
  assert(result?.schemaVersion === 1, 'Monitor result schemaVersion must be 1.');
  assert(kind === 'failure' || kind === 'recovery', 'Alert kind must be failure or recovery.');
  assert(repository, 'Repository is required for deploy-run links.');

  const identity = result.triageIdentity;
  const heading =
    kind === 'failure' ? '## Repeated production smoke failure' : '## Production smoke recovered';
  const statusLines =
    kind === 'failure'
      ? [
          `- consecutive failures: **${result.consecutiveFailures}**`,
          `- failure: ${result.error || 'unknown monitor failure'}`,
          `- controlled simulation: ${result.simulated ? 'yes' : 'no'}`,
        ]
      : ['- status: **PASS**', '- consecutive failures reset to **0**'];

  return [
    heading,
    '',
    `- checked at: ${result.checkedAt}`,
    `- production URL: ${result.baseUrl}`,
    ...statusLines,
    `- monitor run: ${result.monitorRunUrl || 'unavailable'}`,
    '',
    '### Deploy identity for triage',
    '',
    ...identityLines(identity, repository),
    '',
    kind === 'failure'
      ? 'The monitor fails closed. Use the linked deploy identity and the production rollback runbook for triage.'
      : 'The live route and required PWA resources passed again; this incident can be closed.',
    '',
  ].join('\n');
};

const parseArgs = (argv) => {
  const args = { resultJson: '', outputFile: '', kind: '', repository: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }
    const key = current.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in args)) {
      continue;
    }
    args[key] = argv[index + 1] ?? '';
    index += 1;
  }
  for (const [name, value] of Object.entries(args)) {
    assert(value, `Missing required --${name} argument.`);
  }
  return args;
};

export const main = (argv = process.argv.slice(2)) => {
  const args = parseArgs(argv);
  const result = JSON.parse(fs.readFileSync(args.resultJson, 'utf8'));
  fs.mkdirSync(path.dirname(args.outputFile), { recursive: true });
  fs.writeFileSync(args.outputFile, formatMonitorAlert(result, args.kind, args.repository), 'utf8');
};

const isCliInvocation =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCliInvocation) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
