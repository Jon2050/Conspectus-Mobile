import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- .mjs import has no type declarations
import { normalizeBasePath, toPreviewSlug } from './deploy-utils.mjs';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(thisFilePath);
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const deployPreviewWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/deploy-preview.yml',
);
const deployProductionWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/deploy-production.yml',
);
const rollbackProductionWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/rollback-production.yml',
);
const postDeployMonitorWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/post-deploy-monitor.yml',
);
const qualityWorkflowPath = path.resolve(repositoryRootPath, '.github/workflows/quality.yml');
const dependencyAuditWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/dependency-audit.yml',
);
const packageManifestPath = path.resolve(repositoryRootPath, 'package.json');

describe('normalizeBasePath', () => {
  it('adds leading slash when missing', () => {
    expect(normalizeBasePath('foo/')).toBe('/foo/');
  });

  it('adds trailing slash when missing', () => {
    expect(normalizeBasePath('/foo')).toBe('/foo/');
  });

  it('adds both slashes when missing', () => {
    expect(normalizeBasePath('foo')).toBe('/foo/');
  });

  it('returns unchanged when already normalized', () => {
    expect(normalizeBasePath('/foo/')).toBe('/foo/');
  });

  it('handles nested paths', () => {
    expect(normalizeBasePath('/conspectus')).toBe('/conspectus/');
  });

  it('normalizes an empty string to a single slash', () => {
    expect(normalizeBasePath('')).toBe('/');
  });

  it('returns root slash unchanged', () => {
    expect(normalizeBasePath('/')).toBe('/');
  });

  it('preserves double-slash interior segments', () => {
    expect(normalizeBasePath('//foo')).toBe('//foo/');
  });
});

describe('toPreviewSlug', () => {
  it('lowercases input', () => {
    expect(toPreviewSlug('MAIN')).toBe('main');
  });

  it('replaces forward slashes with _2f_', () => {
    expect(toPreviewSlug('feature/login')).toBe('feature_2f_login');
  });

  it('hex-encodes non-alphanumeric characters (except hyphens)', () => {
    expect(toPreviewSlug('my.branch_name')).toBe('my_2e_branch_5f_name');
  });

  it('strips leading/trailing hyphens', () => {
    expect(toPreviewSlug('--branch--')).toBe('branch');
  });

  it('trims whitespace', () => {
    expect(toPreviewSlug('  main  ')).toBe('main');
  });

  it('handles complex branch names', () => {
    expect(toPreviewSlug('feature/UPPER-Case/dots.and_underscores')).toBe(
      'feature_2f_upper-case_2f_dots_2e_and_5f_underscores',
    );
  });
});

describe('fixed preview slot workflow contract', () => {
  it('routes preview deployments to fixed main/test slots from Quality workflow_run events', () => {
    const workflowSource = fs.readFileSync(deployPreviewWorkflowPath, 'utf8');
    expect(workflowSource).toContain('on:\n  workflow_run:');
    expect(workflowSource).toContain('workflows:\n      - Quality');
    expect(workflowSource).toContain(
      'name: Confirm trigger commit is still the current branch tip',
    );
    expect(workflowSource).toContain('steps.branch-head.outputs.is_current_branch_head');
    expect(workflowSource).toContain("preview_slot='test'");
    expect(workflowSource).toContain("preview_slot='main'");
    expect(workflowSource).toContain("event == 'push'");
    expect(workflowSource).toContain('name: quality-preview-dist');
    expect(workflowSource).toContain('run-id: ${{ github.event.workflow_run.id }}');
    expect(workflowSource).toContain(
      'destination_dir: previews/${{ needs.prepare-context.outputs.preview_slot }}',
    );
  });

  it('serializes preview deployments by fixed slot and no longer polls Quality', () => {
    const workflowSource = fs.readFileSync(deployPreviewWorkflowPath, 'utf8');
    expect(workflowSource).toContain(
      "group: deploy-preview-${{ github.event.workflow_run.head_branch == 'main' && 'main' || 'test' }}",
    );
    expect(workflowSource).not.toContain('wait-for-quality');
  });

  it('waits for the exact preview commit before running live release checks', () => {
    const workflowSource = fs.readFileSync(deployPreviewWorkflowPath, 'utf8');
    expect(workflowSource).toContain('name: Write preview deployment marker');
    expect(workflowSource).toContain('dist/preview-deploy-marker.json');
    expect(workflowSource).toContain(
      'EXPECTED_HEAD_SHA: ${{ needs.prepare-context.outputs.head_sha }}',
    );
    expect(workflowSource).toContain('[ "${marker_commit_sha}" = "${EXPECTED_HEAD_SHA}" ]');
    expect(workflowSource).toContain('?deployment=${cache_buster}');
    expect(workflowSource).toContain("PREVIEW_SMOKE_RETRY_DELAY_SECONDS: '3'");
    expect(workflowSource).toContain('--number-of-runs');
    expect(workflowSource).toContain(
      "needs.prepare-context.outputs.preview_slot == 'main' && '3' || '1'",
    );
  });
});

describe('quality workflow contract', () => {
  it('runs on push only and ignores gh-pages deploy commits', () => {
    const workflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    expect(workflowSource).toContain('on:\n  push:');
    expect(workflowSource).toContain('branches-ignore:\n      - gh-pages');
    expect(workflowSource).not.toContain('pull_request:');
  });

  it('fans lint, unit, and build out and runs full branch coverage before main smoke', () => {
    const workflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    expect(workflowSource).toContain('run: npm run check:dead-code');
    expect(workflowSource).toContain('lint-typecheck:');
    expect(workflowSource).toMatch(
      /lint-typecheck:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes/,
    );
    expect(workflowSource).toContain('unit-tests:');
    expect(workflowSource).toMatch(
      /unit-tests:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+if:/,
    );
    expect(workflowSource).toContain('build:');
    expect(workflowSource).toMatch(/build:\n(?:.*\n)*?\s+name: Build App \(Preview\)/);
    expect(workflowSource).toMatch(/build:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+if:/);
    expect(workflowSource).not.toContain('build-verification:');
    expect(workflowSource).toContain('name: Enforce JS/CSS bundle size budgets');
    expect(workflowSource).toContain('name: Verify preview build output paths and scope');
    expect(workflowSource).toContain('e2e-tests:');
    expect(workflowSource).toMatch(
      /e2e-tests:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+- build/,
    );
    expect(workflowSource).toContain('include: ${{ fromJSON(');
    const matrixMatch = /include: \$\{\{ fromJSON\(.*?&& '([^']+)' \|\| '([^']+)'/u.exec(
      workflowSource,
    );
    expect(matrixMatch).not.toBeNull();
    const [mainMatrix, branchMatrix] = matrixMatch!
      .slice(1)
      .map((value) => JSON.parse(value) as { project: string; shard: string; id: string }[]);
    expect(mainMatrix!.map(({ project }) => project).sort()).toEqual([
      'chromium',
      'iphone-13-safari',
    ]);
    const branchProjects = [...new Set(branchMatrix!.map(({ project }) => project))].sort();
    expect(branchProjects).toEqual(['chromium', 'iphone-13-safari', 'pixel-5']);
    for (const project of branchProjects) {
      const shards = branchMatrix!
        .filter((entry) => entry.project === project)
        .map(({ shard }) => shard.split('/').map(Number));
      expect(shards.map(([index]) => index).sort()).toEqual(
        Array.from({ length: shards.length }, (_, index) => index + 1),
      );
      expect(shards.every(([, total]) => total === shards.length)).toBe(true);
    }
    expect(new Set(branchMatrix!.map(({ id }) => id)).size).toBe(branchMatrix!.length);
    expect(workflowSource).toContain(
      'npx playwright test --project="${{ matrix.project }}" --grep @smoke',
    );
    expect(workflowSource).toContain('--fully-parallel --workers=1 --shard="${{ matrix.shard }}"');
    expect(workflowSource).toContain('quality-gate:');
    expect(workflowSource).toMatch(
      /quality-gate:\n(?:.*\n)*?\s+needs:\n\s+- dependency-audit\n\s+- detect-code-changes\n\s+- lint-typecheck\n\s+- unit-tests\n\s+- build\n\s+- e2e-tests/,
    );
    expect(workflowSource).toContain('name: Quality Gate');
    expect(workflowSource).toContain('name: quality-preview-dist');
    expect(workflowSource).not.toContain('name: quality-production-dist');
    expect(workflowSource).toContain('include-hidden-files: true');
    expect(workflowSource).toContain(
      "DEPLOY_PREVIEW_SLUG: ${{ github.ref_name == 'main' && 'main' || 'test' }}",
    );
    expect(workflowSource).toContain('PLAYWRIGHT_APP_BASE_PATH:');
    expect(workflowSource).toContain(
      'Protected main merge completed the exact-SHA build verification and Chromium/WebKit smoke including PWA offline reload.',
    );
    expect(workflowSource).toContain('github.ref_name != github.event.repository.default_branch');
  });

  it('pins the E2E container to the locked Playwright version and bounds job duration', () => {
    const workflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    const e2eJob = workflowSource.split('  e2e-tests:')[1]!.split('  quality-gate:')[0]!;
    const lock = JSON.parse(
      fs.readFileSync(path.join(repositoryRootPath, 'package-lock.json'), 'utf8'),
    ) as { packages: Record<string, { version: string }> };
    const version = lock.packages['node_modules/@playwright/test']!.version;
    expect(e2eJob).toContain(`image: mcr.microsoft.com/playwright:v${version}-noble@sha256:`);
    expect(e2eJob).toMatch(/-noble@sha256:[a-f0-9]{64}\b/);
    expect(e2eJob).toContain('runs-on: ubuntu-24.04');
    expect(e2eJob).toContain('timeout-minutes: 20');
    expect(e2eJob).toContain('shell: bash');
    expect(e2eJob).not.toContain('playwright install');
    expect(e2eJob).toContain(
      'npm run test:e2e -- --project="${{ matrix.project }}" --fully-parallel --workers=1',
    );
  });

  it('runs the local quality prerequisites concurrently before build verification', () => {
    const packageManifest = JSON.parse(fs.readFileSync(packageManifestPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageManifest.scripts['check:local']).toBe('node scripts/run-local-quality.mjs');
  });

  it('requires dependency auditing before both code-bearing and docs-only pushes pass', () => {
    const workflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    const auditResultCheckIndex = workflowSource.indexOf(
      'if [ "${DEPENDENCY_AUDIT_RESULT}" != \'success\' ]; then',
    );
    const docsOnlyExitIndex = workflowSource.indexOf('if [ "${CODE_CHANGED}" = \'false\' ]; then');

    expect(workflowSource).toContain('uses: ./.github/workflows/dependency-audit.yml');
    expect(auditResultCheckIndex).toBeGreaterThan(-1);
    expect(docsOnlyExitIndex).toBeGreaterThan(auditResultCheckIndex);
  });
});

describe('dependency audit workflow contract', () => {
  it('avoids duplicate PR auditing while keeping reusable, scheduled and manual scans', () => {
    const workflowSource = fs.readFileSync(dependencyAuditWorkflowPath, 'utf8');
    const packageManifest = JSON.parse(fs.readFileSync(packageManifestPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(workflowSource).toContain('workflow_call:');
    expect(workflowSource).not.toContain('pull_request:');
    expect(workflowSource).toContain('schedule:');
    expect(workflowSource).toMatch(/cron: '[^']+'/);
    expect(workflowSource).toContain('workflow_dispatch:');
    expect(workflowSource).toContain('run: npm run audit:dependencies');
    expect(packageManifest.scripts['audit:dependencies']).toBe('npm audit --audit-level=high');
  });
});

describe('workflow action pinning', () => {
  it('uses full commit SHAs for every referenced action', () => {
    const workflowPaths = [
      qualityWorkflowPath,
      dependencyAuditWorkflowPath,
      deployPreviewWorkflowPath,
      deployProductionWorkflowPath,
      rollbackProductionWorkflowPath,
      postDeployMonitorWorkflowPath,
    ];

    for (const workflowPath of workflowPaths) {
      const workflowSource = fs.readFileSync(workflowPath, 'utf8');
      const actionReferences = [...workflowSource.matchAll(/^\s*uses:\s+[^@\s]+@([^\s#]+)/gm)];

      expect(actionReferences.length).toBeGreaterThan(0);
      expect(
        actionReferences.every((reference) => /^[a-f0-9]{40}$/u.test(reference[1] ?? '')),
      ).toBe(true);
    }
  });
});

describe('production workflow contracts', () => {
  it('deploys production manually from the current main commit after a successful Quality run', () => {
    const workflowSource = fs.readFileSync(deployProductionWorkflowPath, 'utf8');
    expect(workflowSource).toContain('on:\n  workflow_dispatch:');
    expect(workflowSource).toContain('VITE_AZURE_CLIENT_ID: ${{ vars.VITE_AZURE_CLIENT_ID }}');
    expect(workflowSource).toContain('name: Require main branch');
    expect(workflowSource).toContain('name: Resolve current main commit target');
    expect(workflowSource).toContain(
      'name: Resolve successful Quality run for current main commit',
    );
    expect(workflowSource).toContain(
      'actions/workflows/quality.yml/runs?branch=main&event=push&head_sha=${TARGET_COMMIT_SHA}&per_page=100&page=${page}',
    );
    expect(workflowSource).toContain('name: Validate required runtime env');
    expect(workflowSource).toContain('Missing repository variable VITE_AZURE_CLIENT_ID.');
    expect(workflowSource).toContain('name: Build production artifact');
    expect(workflowSource).toContain('DEPLOY_CHANNEL: production');
    expect(workflowSource).toContain('name: Verify production build output paths and scope');
    expect(workflowSource).toContain(
      'artifact_name="conspectus-mobile-production-${{ steps.target.outputs.commit_sha }}"',
    );
    expect(workflowSource).toContain('include-hidden-files: true');
    expect(workflowSource).toContain(
      '"qualityRunId": "${{ steps.quality_run.outputs.quality_run_id }}"',
    );
    expect(workflowSource).toContain('conspectus-mobile-production-ready');
    expect(workflowSource).toContain('node scripts/verify-production-deploy-smoke.mjs');
    expect(workflowSource).toContain("PRODUCTION_SMOKE_RETRY_DELAY_SECONDS: '3'");
  });

  it('exports the required Vite client id variable before validating or building production', () => {
    const qualityWorkflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    const productionWorkflowSource = fs.readFileSync(deployProductionWorkflowPath, 'utf8');
    const viteClientIdMapping = 'VITE_AZURE_CLIENT_ID: ${{ vars.VITE_AZURE_CLIENT_ID }}';

    expect(qualityWorkflowSource).toContain(viteClientIdMapping);
    expect(productionWorkflowSource).toContain(viteClientIdMapping);
    expect(productionWorkflowSource).toContain('name: Validate required runtime env');
    expect(productionWorkflowSource).toContain(
      'name: Fail on current high or critical dependency vulnerabilities',
    );
    expect(productionWorkflowSource).toContain('run: npm run audit:dependencies');
    expect(productionWorkflowSource).toContain(
      'echo "Missing repository variable VITE_AZURE_CLIENT_ID." >&2',
    );
  });
});

describe('production rollback workflow contract', () => {
  it('validates exact historical identity in dry-run mode before an explicit dispatch', () => {
    const workflowSource = fs.readFileSync(rollbackProductionWorkflowPath, 'utf8');

    expect(workflowSource).toContain('name: Rollback Production');
    expect(workflowSource).toContain('pull_request:');
    expect(workflowSource).toContain('workflow_dispatch:');
    expect(workflowSource).toContain('deploy_run_id:');
    expect(workflowSource).toContain('commit_sha:');
    expect(workflowSource).toContain('execute:');
    expect(workflowSource).toContain('name: Verify rollback target identity');
    expect(workflowSource).toContain('node scripts/verify-rollback-target.mjs');
    expect(workflowSource).toContain('name: Verify website consumer handoff contract');
    expect(workflowSource).toContain('Result: PASS (no deployment dispatched)');
    expect(workflowSource).toContain(
      "if: github.event_name == 'workflow_dispatch' && inputs.execute",
    );
    expect(workflowSource).toContain('conspectus-mobile-production-ready');
    expect(workflowSource).toContain('node scripts/verify-production-deploy-smoke.mjs');
    expect(workflowSource).toContain('--max-attempts 48');
    expect(workflowSource).toContain('--deadline-seconds 480');
    expect(workflowSource).toContain('group: deploy-production');
    expect(workflowSource).toContain('name: Fetch public website consumer contract');
    const publicFetchStepStart = workflowSource.indexOf(
      'name: Fetch public website consumer contract',
    );
    const publicFetchStepEnd = workflowSource.indexOf('\n      - name:', publicFetchStepStart);
    const publicFetchStep = workflowSource.slice(publicFetchStepStart, publicFetchStepEnd);
    expect(publicFetchStep).toContain('${PRODUCTION_APP_BASE_URL}conspectus-deploy-contract.json');
    expect(publicFetchStep).toContain('--connect-timeout 10');
    expect(publicFetchStep).toContain('--max-time 30');
    expect(publicFetchStep).toContain('--retry 2');
    expect(workflowSource).toContain('--contract-json website-deploy-contract.json');
    expect(publicFetchStep).not.toContain('WEBSITE_REPO_DISPATCH_TOKEN');
    expect(publicFetchStep).not.toContain('Authorization: Bearer');
  });
});
