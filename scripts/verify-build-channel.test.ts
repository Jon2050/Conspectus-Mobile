import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const thisFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(thisFilePath);
const repositoryRootPath = path.resolve(scriptsDirectoryPath, '..');
const verifyScriptPath = path.resolve(scriptsDirectoryPath, 'verify-build-channel.mjs');

const createFixtureDirectory = () => mkdtempSync(path.join(tmpdir(), 'verify-build-channel-'));

const writeText = (filePath: string, value: string) => {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, 'utf8');
};

type DistFixtureOptions = {
  includeCspMeta?: boolean;
  cspMetaContent?: string;
};

const BASE_CSP_META_CONTENT =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'";

const createDistFixture = (
  fixtureRootPath: string,
  jsAssetContent: string,
  options: DistFixtureOptions = {},
) => {
  const distPath = path.join(fixtureRootPath, 'dist');
  const basePath = '/conspectus/webapp/';
  const includeCspMeta = options.includeCspMeta ?? true;
  const cspMetaContent = options.cspMetaContent ?? BASE_CSP_META_CONTENT;
  const cspMetaTag = includeCspMeta
    ? `<meta http-equiv="Content-Security-Policy" content="${cspMetaContent}" />`
    : '';

  writeText(
    path.join(distPath, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    ${cspMetaTag}
    <link rel="manifest" href="${basePath}manifest.webmanifest" />
    <link rel="stylesheet" href="${basePath}assets/index.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${basePath}assets/index.js"></script>
  </body>
</html>`,
  );

  writeText(
    path.join(distPath, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'Conspectus Mobile',
        start_url: basePath,
        scope: basePath,
      },
      null,
      2,
    ),
  );

  writeText(path.join(distPath, 'assets', 'index.css'), '.app { color: #111; }');
  writeText(path.join(distPath, 'assets', 'index.js'), jsAssetContent);

  return distPath;
};

const runVerifier = (args: string[]) =>
  spawnSync('node', [verifyScriptPath, ...args], {
    cwd: repositoryRootPath,
    encoding: 'utf8',
  });

describe('verify-build-channel script', () => {
  it('accepts valid production channel output', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = createDistFixture(
        fixturePath,
        `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/conspectus/webapp/sw.js', { scope: '/conspectus/webapp/' }); }`,
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'production',
        '--base',
        '/conspectus/webapp/',
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        '[verify-build-channel] production build output is valid for base path /conspectus/webapp/',
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when index.html is missing the CSP meta tag', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = createDistFixture(
        fixturePath,
        `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/conspectus/webapp/sw.js', { scope: '/conspectus/webapp/' }); }`,
        { includeCspMeta: false },
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'production',
        '--base',
        '/conspectus/webapp/',
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Missing Content-Security-Policy meta tag in index.html.');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when root-absolute asset paths leak outside expected base', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = createDistFixture(
        fixturePath,
        `const leaked = '/assets/should-not-be-rooted.js';\nconsole.log(leaked);\nif ('serviceWorker' in navigator) { navigator.serviceWorker.register('/conspectus/webapp/sw.js', { scope: '/conspectus/webapp/' }); }`,
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'production',
        '--base',
        '/conspectus/webapp/',
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Found root-path leakage outside expected base');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when script-src does not include wasm-unsafe-eval', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = createDistFixture(
        fixturePath,
        `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/conspectus/webapp/sw.js', { scope: '/conspectus/webapp/' }); }`,
        {
          cspMetaContent:
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'",
        },
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'production',
        '--base',
        '/conspectus/webapp/',
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Content-Security-Policy script-src directive must include 'wasm-unsafe-eval' for sql.js WASM runtime support.",
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when service worker scope is not restricted to the expected base', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = createDistFixture(
        fixturePath,
        `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/conspectus/webapp/sw.js', { scope: '/' }); }`,
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'production',
        '--base',
        '/conspectus/webapp/',
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Service worker scope is not restricted to /conspectus/webapp/.',
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('accepts valid preview channel output with the shared fixed-slot base path', () => {
    const fixturePath = createFixtureDirectory();
    const previewBase = '/Conspectus-Mobile/previews/test/';

    try {
      const distPath = path.join(fixturePath, 'dist');

      writeText(
        path.join(distPath, 'index.html'),
        `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="${BASE_CSP_META_CONTENT}" />
    <link rel="manifest" href="${previewBase}manifest.webmanifest" />
    <link rel="stylesheet" href="${previewBase}assets/index.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${previewBase}assets/index.js"></script>
  </body>
</html>`,
      );

      writeText(
        path.join(distPath, 'manifest.webmanifest'),
        JSON.stringify({ name: 'Conspectus Mobile', start_url: previewBase, scope: previewBase }),
      );

      writeText(path.join(distPath, 'assets', 'index.css'), '.app { color: #111; }');
      writeText(
        path.join(distPath, 'assets', 'index.js'),
        `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('${previewBase}sw.js', { scope: '${previewBase}' }); }`,
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'preview',
        '--base',
        previewBase,
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `[verify-build-channel] preview build output is valid for base path ${previewBase}`,
      );
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });

  it('fails when manifest start_url does not match the expected base path', () => {
    const fixturePath = createFixtureDirectory();

    try {
      const distPath = path.join(fixturePath, 'dist');
      const basePath = '/conspectus/webapp/';

      writeText(
        path.join(distPath, 'index.html'),
        `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="${BASE_CSP_META_CONTENT}" />
    <link rel="manifest" href="${basePath}manifest.webmanifest" />
    <link rel="stylesheet" href="${basePath}assets/index.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="${basePath}assets/index.js"></script>
  </body>
</html>`,
      );

      writeText(
        path.join(distPath, 'manifest.webmanifest'),
        JSON.stringify({
          name: 'Conspectus Mobile',
          start_url: '/wrong-path/',
          scope: basePath,
        }),
      );

      writeText(path.join(distPath, 'assets', 'index.css'), '.app { color: #111; }');
      writeText(
        path.join(distPath, 'assets', 'index.js'),
        `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('${basePath}sw.js', { scope: '${basePath}' }); }`,
      );

      const result = runVerifier([
        '--dist',
        distPath,
        '--channel',
        'production',
        '--base',
        basePath,
      ]);

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Manifest start_url mismatch');
    } finally {
      rmSync(fixturePath, { force: true, recursive: true });
    }
  });
});
