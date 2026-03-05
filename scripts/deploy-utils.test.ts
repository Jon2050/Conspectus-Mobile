import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- .mjs import has no type declarations
import { normalizeBasePath, toPreviewSlug } from './deploy-utils.mjs';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(thisFilePath);
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const slugifyScriptPath = path.resolve(scriptsDirectoryPath, 'slugify-branch.py');
const deployChannelsWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/deploy-channels.yml',
);
const previewCleanupWorkflowPath = path.resolve(
  repositoryRootPath,
  '.github/workflows/preview-cleanup.yml',
);

const runPythonSlugify = (branchName: string): string => {
  const result = execSync('python ' + JSON.stringify(slugifyScriptPath), {
    encoding: 'utf8',
    env: { ...process.env, BRANCH_NAME: branchName },
  });
  return result.trim();
};

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

describe('JS/Python slug parity (contract test)', () => {
  const branchNames = [
    'main',
    'feature/add-login',
    'my-branch',
    'UPPER/Case',
    'dots.and_underscores',
    'feature/UPPER-Case/dots.and_underscores',
    'bugfix/fix-123',
    'release/v1.0.0',
    'user/name@special',
  ];

  for (const branchName of branchNames) {
    it(`produces identical output for "${branchName}"`, () => {
      const jsResult = toPreviewSlug(branchName);
      const pyResult = runPythonSlugify(branchName);
      expect(jsResult).toBe(pyResult);
    });
  }
});

describe('workflow slug-script contract', () => {
  const workflowFilePaths = [deployChannelsWorkflowPath, previewCleanupWorkflowPath];

  for (const workflowFilePath of workflowFilePaths) {
    const workflowRelativePath = path.relative(repositoryRootPath, workflowFilePath);

    it(`uses shared slugify script in ${workflowRelativePath}`, () => {
      const workflowSource = fs.readFileSync(workflowFilePath, 'utf8');
      expect(workflowSource).toContain('BRANCH_NAME:');
      expect(workflowSource).toContain('branch_slug="$(python scripts/slugify-branch.py)"');
      expect(workflowSource).not.toMatch(/python\s+-\s*<<\s*['"]?PY['"]?/);
    });
  }
});

describe('fixed preview slot workflow contract', () => {
  it('routes preview deployments to fixed main/test slots', () => {
    const workflowSource = fs.readFileSync(deployChannelsWorkflowPath, 'utf8');
    expect(workflowSource).toContain("preview_slot='test'");
    expect(workflowSource).toContain("preview_slot='main'");
    expect(workflowSource).toContain(
      'destination_dir: previews/${{ needs.prepare-context.outputs.preview_slot }}',
    );
    expect(workflowSource).toContain(
      '/previews/${{ needs.prepare-context.outputs.preview_slot }}/',
    );
  });

  it('serializes preview deployments by fixed slot', () => {
    const workflowSource = fs.readFileSync(deployChannelsWorkflowPath, 'utf8');
    expect(workflowSource).toContain(
      "group: deploy-channels-${{ github.event.workflow_run.head_branch == 'main' && 'main' || 'test' }}",
    );
  });

  it('preserves fixed preview slots during cleanup', () => {
    const workflowSource = fs.readFileSync(previewCleanupWorkflowPath, 'utf8');
    expect(workflowSource).toContain(
      'if [ "${BRANCH_SLUG}" = \'main\' ] || [ "${BRANCH_SLUG}" = \'test\' ]; then',
    );
    expect(workflowSource).toContain('Skipping cleanup for fixed preview slot');
  });
});
