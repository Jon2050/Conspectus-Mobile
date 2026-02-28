#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const normalizeBasePath = (value) => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const parseArgs = (argv) => {
  const args = {
    dist: 'dist',
    channel: '',
    base: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--dist') {
      args.dist = argv[index + 1] ?? args.dist;
      index += 1;
      continue;
    }

    if (current === '--channel') {
      args.channel = argv[index + 1] ?? args.channel;
      index += 1;
      continue;
    }

    if (current === '--base') {
      args.base = argv[index + 1] ?? args.base;
      index += 1;
      continue;
    }
  }

  if (!args.channel) {
    throw new Error('Missing required --channel argument.');
  }

  if (!args.base) {
    throw new Error('Missing required --base argument.');
  }

  return {
    dist: args.dist,
    channel: args.channel,
    base: normalizeBasePath(args.base),
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const readTextFile = (filePath) => {
  assert(fs.existsSync(filePath), `Missing expected file: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
};

const getAbsolutePathReferences = (htmlText) => {
  const references = [];
  const regex = /(?:src|href)="(\/[^"]+)"/g;

  for (const match of htmlText.matchAll(regex)) {
    references.push(match[1]);
  }

  return references;
};

const verifyAbsolutePathReferences = (indexHtml, expectedBasePath) => {
  const absoluteReferences = getAbsolutePathReferences(indexHtml);
  const unexpectedPaths = absoluteReferences.filter((entry) => !entry.startsWith(expectedBasePath));

  assert(
    unexpectedPaths.length === 0,
    `Found unexpected root-absolute asset reference(s): ${unexpectedPaths.join(', ')}`,
  );
};

const verifyManifest = (manifestText, expectedBasePath) => {
  const manifest = JSON.parse(manifestText);

  assert(
    manifest.start_url === expectedBasePath,
    `Manifest start_url mismatch. Expected "${expectedBasePath}", got "${manifest.start_url}".`,
  );

  assert(
    manifest.scope === expectedBasePath,
    `Manifest scope mismatch. Expected "${expectedBasePath}", got "${manifest.scope}".`,
  );
};

const collectJavaScriptAssets = (distDir) => {
  const assetsDirPath = path.join(distDir, 'assets');
  if (!fs.existsSync(assetsDirPath)) {
    return [];
  }

  return fs
    .readdirSync(assetsDirPath)
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => readTextFile(path.join(assetsDirPath, entry)));
};

const verifyServiceWorkerRegistration = (distDir, expectedBasePath) => {
  const jsAssets = collectJavaScriptAssets(distDir);
  const hasServiceWorkerPath = jsAssets.some((assetText) =>
    assetText.includes(`${expectedBasePath}sw.js`),
  );

  assert(hasServiceWorkerPath, `Service worker path is not scoped to ${expectedBasePath}.`);

  const scopePatterns = [
    `scope:"${expectedBasePath}"`,
    `scope:"${expectedBasePath.slice(0, -1)}"`,
    `scope:\\"${expectedBasePath}\\"`,
    `scope:\\"${expectedBasePath.slice(0, -1)}\\"`,
  ];
  const hasScopedRegistration = jsAssets.some((assetText) =>
    scopePatterns.some((pattern) => assetText.includes(pattern)),
  );

  assert(hasScopedRegistration, `Service worker scope is not restricted to ${expectedBasePath}.`);
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const distDir = path.resolve(process.cwd(), args.dist);
  const indexPath = path.join(distDir, 'index.html');
  const manifestPath = path.join(distDir, 'manifest.webmanifest');

  const indexHtml = readTextFile(indexPath);
  const manifestText = readTextFile(manifestPath);

  verifyAbsolutePathReferences(indexHtml, args.base);
  verifyManifest(manifestText, args.base);
  verifyServiceWorkerRegistration(distDir, args.base);

  console.log(
    `[verify-build-channel] ${args.channel} build output is valid for base path ${args.base}`,
  );
};

main();
