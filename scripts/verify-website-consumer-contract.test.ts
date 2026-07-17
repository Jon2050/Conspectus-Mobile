import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(thisFilePath);
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const verifyScriptPath = path.resolve(scriptsDirectoryPath, 'verify-website-consumer-contract.mjs');

const createFixtureDirectory = () => mkdtempSync(path.join(tmpdir(), 'verify-website-contract-'));

const runVerifier = (args: string[]) =>
  spawnSync('node', [verifyScriptPath, ...args], {
    cwd: repositoryRootPath,
    encoding: 'utf8',
  });

const encodeWorkflowPayload = (workflowYaml: string) =>
  JSON.stringify(
    {
      encoding: 'base64',
      content: Buffer.from(workflowYaml, 'utf8').toString('base64'),
    },
    null,
    2,
  );

const createValidWorkflow = () =>
  [
    'name: Deploy to FTP',
    'on:',
    '  repository_dispatch:',
    '    types:',
    '      - conspectus-mobile-production-ready',
    'jobs:',
    '  deploy-conspectus-mobile:',
    "    if: github.event_name == 'repository_dispatch'",
    '    env:',
    '      PRODUCER_REPO: Jon2050/Conspectus-Mobile',
    "      CONSPECTUS_LIVE_BASE_URL: ${{ vars.CONSPECTUS_LIVE_BASE_URL || 'https://jon2050.de/conspectus/' }}",
    '    steps:',
    '      - name: Validate dispatch payload and token',
    '        env:',
    '          COMMIT_SHA: ${{ github.event.client_payload.commitSha }}',
    '          DEPLOY_RUN_ID: ${{ github.event.client_payload.deployRunId }}',
    '          QUALITY_RUN_ID: ${{ github.event.client_payload.qualityRunId }}',
    '          ARTIFACT_NAME: ${{ github.event.client_payload.artifactName }}',
    '      - name: Resolve and download producer artifact',
    '        run: |',
    '          run_url="https://api.github.com/repos/${PRODUCER_REPO}/actions/runs/${DEPLOY_RUN_ID}"',
    '      - name: Validate deploy metadata and identity',
    '        env:',
    '          EXPECTED_BASE_PATH: /conspectus/',
    '        run: node ./scripts/validate-conspectus-deploy-metadata.mjs ./pwa-artifact/deploy-metadata.json',
    '      - name: Stage Conspectus website subtree',
    '        run: |',
    '          node ./scripts/validate-conspectus-security-headers.mjs "${incoming_dir}/.htaccess"',
    '          test -f "${incoming_dir}/index.html"',
    '          server-dir: ./www/conspectus.__incoming/',
    '          mv ./www/conspectus.__incoming ./www/conspectus',
    '      - name: Verify staged static PWA response',
    '        run: node ./scripts/verify-conspectus-staging-response.mjs',
    '      - name: Verify promoted PWA identity and resources',
    '        run: node ./scripts/verify-conspectus-live-response.mjs',
    '      - name: Restore previous PWA after failed live verification',
    '        run: mv ./www/conspectus.__backup ./www/conspectus',
  ].join('\n');

describe('verify-website-consumer-contract script', () => {
  it('accepts a workflow that matches the producer/consumer handoff contract', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(createValidWorkflow()));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      if (result.error) {
        throw result.error;
      }

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        '[verify-website-consumer-contract] verified /conspectus/ consumer',
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('accepts UTF-8 BOM prefixed JSON payload files', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow-with-bom.json');

    try {
      const payload = encodeWorkflowPayload(createValidWorkflow());
      writeFileSync(workflowJsonPath, `\uFEFF${payload}`);

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      if (result.error) {
        throw result.error;
      }

      expect(result.status).toBe(0);
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when required dispatch event type marker is missing', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      const invalidWorkflow = createValidWorkflow().replace(
        'conspectus-mobile-production-ready',
        'wrong-event-type',
      );
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(invalidWorkflow));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      if (result.error) {
        throw result.error;
      }

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('conspectus-mobile-production-ready');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when producer repo binding does not match expected repository', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(createValidWorkflow()));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Another-Repo',
      ]);

      if (result.error) {
        throw result.error;
      }

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('PRODUCER_REPO must be "Jon2050/Another-Repo"');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when the consumer does not validate the PWA-owned security policy', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      const invalidWorkflow = createValidWorkflow().replace(
        'validate-conspectus-security-headers.mjs',
        'skip-security-header-validation.mjs',
      );
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(invalidWorkflow));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('validate-conspectus-security-headers.mjs');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when the consumer does not verify the staged static app shell', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      const invalidWorkflow = createValidWorkflow().replace(
        'verify-conspectus-staging-response.mjs',
        'skip-staging-response-validation.mjs',
      );
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(invalidWorkflow));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('verify-conspectus-staging-response.mjs');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when the consumer does not bind metadata to the production subtree', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      const invalidWorkflow = createValidWorkflow().replace(
        'EXPECTED_BASE_PATH: /conspectus/',
        'EXPECTED_BASE_PATH: /',
      );
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(invalidWorkflow));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('EXPECTED_BASE_PATH: /conspectus/');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when the consumer cannot verify and restore a promoted deployment', () => {
    const fixturePath = createFixtureDirectory();
    const workflowJsonPath = path.join(fixturePath, 'workflow.json');

    try {
      const invalidWorkflow = createValidWorkflow().replace(
        'verify-conspectus-live-response.mjs',
        'skip-live-response-validation.mjs',
      );
      writeFileSync(workflowJsonPath, encodeWorkflowPayload(invalidWorkflow));

      const result = runVerifier([
        '--workflow-json',
        workflowJsonPath,
        '--producer-repo',
        'Jon2050/Conspectus-Mobile',
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('verify-conspectus-live-response.mjs');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });
});
