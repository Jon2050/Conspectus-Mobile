// Verifies the bundle-size CLI against representative build artifacts and failure modes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(thisFilePath);
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const checkerPath = path.join(scriptsDirectoryPath, 'check-bundle-size.mjs');

const createFixtureDirectory = () => mkdtempSync(path.join(tmpdir(), 'bundle-size-'));

const writeFixture = (filePath: string, content: string | Uint8Array) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

const writeBudgetConfig = (
  fixturePath: string,
  budgets: {
    javascript: { rawBytes: number; gzipBytes: number };
    css: { rawBytes: number; gzipBytes: number };
  },
) => {
  const configPath = path.join(fixturePath, 'budgets.json');
  writeFixture(configPath, JSON.stringify({ budgets }));
  return configPath;
};

const runChecker = (distPath: string, configPath: string) =>
  spawnSync('node', [checkerPath, '--dist', distPath, '--budget-config', configPath], {
    cwd: repositoryRootPath,
    encoding: 'utf8',
  });

describe('check-bundle-size script', () => {
  it('measures recursive JavaScript and CSS files while ignoring other artifacts', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = path.join(fixturePath, 'dist');
      writeFixture(path.join(distPath, 'sw.js'), 'service worker');
      writeFixture(path.join(distPath, 'assets', 'app.js'), 'application');
      writeFixture(path.join(distPath, 'assets', 'app.css'), 'body { color: black; }');
      writeFixture(path.join(distPath, 'assets', 'sql.wasm'), new Uint8Array(500));
      writeFixture(path.join(distPath, 'assets', 'app.js.map'), new Uint8Array(500));
      writeFixture(path.join(distPath, 'index.html'), '<html></html>');

      const configPath = writeBudgetConfig(fixturePath, {
        javascript: { rawBytes: 1000, gzipBytes: 1000 },
        css: { rawBytes: 1000, gzipBytes: 1000 },
      });
      const result = runChecker(distPath, configPath);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[bundle-size] JavaScript: 2 file(s)');
      expect(result.stdout).toContain('[bundle-size] CSS: 1 file(s)');
      expect(result.stdout).toContain('assets/app.js');
      expect(result.stdout).toContain('sw.js');
      expect(result.stdout).not.toContain('sql.wasm');
      expect(result.stdout).not.toContain('app.js.map');
      expect(result.stdout).toContain('All JavaScript and CSS bundles are within budget.');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when aggregate raw and per-file gzip totals exceed their budgets', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = path.join(fixturePath, 'dist');
      const firstJavaScript = 'const firstValue = "bundle regression one";';
      const secondJavaScript = 'const secondValue = "bundle regression two";';
      writeFixture(path.join(distPath, 'assets', 'app.js'), firstJavaScript);
      writeFixture(path.join(distPath, 'chunks', 'feature.js'), secondJavaScript);
      writeFixture(path.join(distPath, 'assets', 'app.css'), 'body {}');

      const configPath = writeBudgetConfig(fixturePath, {
        javascript: {
          rawBytes: Math.max(firstJavaScript.length, secondJavaScript.length),
          gzipBytes: gzipSync(`${firstJavaScript}${secondJavaScript}`).byteLength,
        },
        css: { rawBytes: 1000, gzipBytes: 1000 },
      });
      const result = runChecker(distPath, configPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('JavaScript raw budget exceeded: actual');
      expect(result.stderr).toContain('JavaScript gzip budget exceeded: actual');
      expect(result.stderr).toContain('budget');
      expect(result.stderr).toContain('excess');
      expect(result.stderr).toContain('docs/CI-CD-Pipelines.md#bundle-size-budgets');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails clearly when the build output directory is missing', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const configPath = writeBudgetConfig(fixturePath, {
        javascript: { rawBytes: 1000, gzipBytes: 1000 },
        css: { rawBytes: 1000, gzipBytes: 1000 },
      });
      const result = runChecker(path.join(fixturePath, 'missing-dist'), configPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Build output directory does not exist:');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it.each([
    { missingLabel: 'JavaScript', presentFile: 'assets/app.css' },
    { missingLabel: 'CSS', presentFile: 'assets/app.js' },
  ])('fails when $missingLabel assets are missing', ({ missingLabel, presentFile }) => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = path.join(fixturePath, 'dist');
      writeFixture(path.join(distPath, presentFile), 'small asset');
      const configPath = writeBudgetConfig(fixturePath, {
        javascript: { rawBytes: 1000, gzipBytes: 1000 },
        css: { rawBytes: 1000, gzipBytes: 1000 },
      });
      const result = runChecker(distPath, configPath);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`${missingLabel} assets are missing from the build output.`);
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });
});
