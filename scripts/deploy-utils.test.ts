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
const qualityWorkflowPath = path.resolve(repositoryRootPath, '.github/workflows/quality.yml');

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
    expect(normalizeBasePath('/conspectus/webapp')).toBe('/conspectus/webapp/');
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
});

describe('quality workflow contract', () => {
  it('runs on push only and ignores gh-pages deploy commits', () => {
    const workflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    expect(workflowSource).toContain('on:\n  push:');
    expect(workflowSource).toContain('branches-ignore:\n      - gh-pages');
    expect(workflowSource).not.toContain('pull_request:');
  });

  it('splits quality stages into detect -> lint/typecheck -> unit -> build preview -> build verification -> e2e -> gate', () => {
    const workflowSource = fs.readFileSync(qualityWorkflowPath, 'utf8');
    expect(workflowSource).toContain('lint-typecheck:');
    expect(workflowSource).toMatch(
      /lint-typecheck:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes/,
    );
    expect(workflowSource).toContain('unit-tests:');
    expect(workflowSource).toMatch(
      /unit-tests:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+- lint-typecheck/,
    );
    expect(workflowSource).toContain('build:');
    expect(workflowSource).toMatch(/build:\n(?:.*\n)*?\s+name: Build App \(Preview\)/);
    expect(workflowSource).toMatch(
      /build:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+- unit-tests/,
    );
    expect(workflowSource).toContain('build-verification:');
    expect(workflowSource).toMatch(
      /build-verification:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+- build/,
    );
    expect(workflowSource).toContain('e2e-tests:');
    expect(workflowSource).toMatch(
      /e2e-tests:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+- build-verification/,
    );
    expect(workflowSource).toContain('quality-gate:');
    expect(workflowSource).toMatch(
      /quality-gate:\n(?:.*\n)*?\s+needs:\n\s+- detect-code-changes\n\s+- lint-typecheck\n\s+- unit-tests\n\s+- build\n\s+- build-verification\n\s+- e2e-tests/,
    );
    expect(workflowSource).toContain('name: Quality Gate');
    expect(workflowSource).toContain('name: quality-preview-dist');
    expect(workflowSource).not.toContain('name: quality-production-dist');
    expect(workflowSource).toContain(
      "DEPLOY_PREVIEW_SLUG: ${{ github.ref_name == 'main' && 'main' || 'test' }}",
    );
    expect(workflowSource).toContain('PLAYWRIGHT_APP_BASE_PATH:');
  });
});

describe('production workflow contracts', () => {
  it('deploys production manually from the current main commit after a successful Quality run', () => {
    const workflowSource = fs.readFileSync(deployProductionWorkflowPath, 'utf8');
    expect(workflowSource).toContain('on:\n  workflow_dispatch:');
    expect(workflowSource).toContain('name: Require main branch');
    expect(workflowSource).toContain('name: Resolve current main commit target');
    expect(workflowSource).toContain(
      'name: Resolve successful Quality run for current main commit',
    );
    expect(workflowSource).toContain(
      'actions/workflows/quality.yml/runs?branch=main&event=push&head_sha=${TARGET_COMMIT_SHA}&per_page=100&page=${page}',
    );
    expect(workflowSource).toContain('name: Build production artifact');
    expect(workflowSource).toContain('DEPLOY_CHANNEL: production');
    expect(workflowSource).toContain('name: Verify production build output paths and scope');
    expect(workflowSource).toContain(
      'artifact_name="conspectus-mobile-production-${{ steps.target.outputs.commit_sha }}"',
    );
    expect(workflowSource).toContain(
      '"qualityRunId": "${{ steps.quality_run.outputs.quality_run_id }}"',
    );
    expect(workflowSource).toContain('conspectus-mobile-production-ready');
    expect(workflowSource).toContain('node scripts/verify-production-deploy-smoke.mjs');
  });
});
