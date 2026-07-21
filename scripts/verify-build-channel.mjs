#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { normalizeBasePath } from './deploy-utils.mjs';
import {
  assertCspEquivalent,
  DOCUMENT_CSP,
  extractApacheHeaderValue,
  extractCspMetaContent,
  PRODUCTION_CSP,
  SECURITY_RESPONSE_HEADERS,
} from './security-policy.mjs';

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

const TEXT_FILE_EXTENSIONS = new Set(['.html', '.js', '.css', '.webmanifest']);
const REQUIRED_INSTALL_ICON_SPECS = [
  { size: '192x192', purpose: 'any' },
  { size: '512x512', purpose: 'any' },
  { size: '192x192', purpose: 'maskable' },
  { size: '512x512', purpose: 'maskable' },
];

const collectTextFiles = (directoryPath) => {
  const discoveredFiles = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      discoveredFiles.push(...collectTextFiles(absolutePath));
      continue;
    }

    if (TEXT_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      discoveredFiles.push(absolutePath);
    }
  }

  return discoveredFiles;
};

const extractRootAbsolutePathReferences = (text) => {
  const references = [];

  const attributePattern = /(?:src|href|content|action)=["'](\/[^"']+)["']/g;
  for (const match of text.matchAll(attributePattern)) {
    references.push(match[1]);
  }

  const cssUrlPattern = /url\((['"]?)(\/[^)'"]+)\1\)/g;
  for (const match of text.matchAll(cssUrlPattern)) {
    references.push(match[2]);
  }

  const quotedPathPattern = /(["'`])(\/[^"'`\s]+)\1/g;
  for (const match of text.matchAll(quotedPathPattern)) {
    references.push(match[2]);
  }

  return references;
};

const stripQueryAndHash = (value) => value.split(/[?#]/)[0];

const isAssetLikeRootPath = (referencePath) => {
  const normalizedReference = stripQueryAndHash(referencePath);
  if (normalizedReference.endsWith('/')) {
    return false;
  }

  return /\/[^/]+\.[a-z0-9]+$/i.test(normalizedReference);
};

const isPathWithinBase = (referencePath, expectedBasePath) => {
  const normalizedReference = stripQueryAndHash(referencePath);
  const expectedBaseWithoutTrailingSlash = expectedBasePath.endsWith('/')
    ? expectedBasePath.slice(0, -1)
    : expectedBasePath;

  if (normalizedReference === expectedBaseWithoutTrailingSlash) {
    return true;
  }

  return normalizedReference.startsWith(expectedBasePath);
};

const verifyNoRootPathLeakage = (distDir, expectedBasePath) => {
  const textFiles = collectTextFiles(distDir);
  const leakedReferences = [];

  for (const filePath of textFiles) {
    const fileText = readTextFile(filePath);
    const references = extractRootAbsolutePathReferences(fileText);

    for (const reference of references) {
      if (reference.startsWith('//')) {
        continue;
      }

      if (!isAssetLikeRootPath(reference)) {
        continue;
      }

      if (!isPathWithinBase(reference, expectedBasePath)) {
        const relativePath = path.relative(distDir, filePath) || path.basename(filePath);
        leakedReferences.push(`${relativePath}:${reference}`);
      }
    }
  }

  const uniqueLeaks = [...new Set(leakedReferences)];
  assert(
    uniqueLeaks.length === 0,
    `Found root-path leakage outside expected base "${expectedBasePath}": ${uniqueLeaks.join(', ')}`,
  );
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

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const { size, purpose } of REQUIRED_INSTALL_ICON_SPECS) {
    const hasRequiredIcon = icons.some(
      (icon) =>
        typeof icon?.src === 'string' &&
        icon.src.trim().length > 0 &&
        typeof icon?.sizes === 'string' &&
        icon.sizes.split(/\s+/u).includes(size) &&
        typeof icon?.purpose === 'string' &&
        icon.purpose.split(/\s+/u).includes(purpose),
    );
    assert(hasRequiredIcon, `Manifest is missing a ${size} install icon with purpose ${purpose}.`);
  }
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

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scopeRegexes = [
    new RegExp(`scope\\s*:\\s*["']${escapeRegex(expectedBasePath)}["']`),
    new RegExp(`scope\\s*:\\s*["']${escapeRegex(expectedBasePath.slice(0, -1))}["']`),
    new RegExp(`scope\\\\\\s*:\\\\s*\\\\["']${escapeRegex(expectedBasePath)}\\\\["']`),
    new RegExp(`scope\\\\\\s*:\\\\s*\\\\["']${escapeRegex(expectedBasePath.slice(0, -1))}\\\\["']`),
  ];
  const hasScopedRegistration = jsAssets.some((assetText) =>
    scopeRegexes.some((pattern) => pattern.test(assetText)),
  );

  assert(hasScopedRegistration, `Service worker scope is not restricted to ${expectedBasePath}.`);
};

const verifyServiceWorkerNavigationFallback = (distDir) => {
  const serviceWorkerText = readTextFile(path.join(distDir, 'sw.js'));
  assert(
    /createHandlerBoundToURL\(["']index\.html["']\)/u.test(serviceWorkerText),
    'Service worker navigation fallback must use the static index.html app shell.',
  );
  assert(
    !/index\.php/u.test(serviceWorkerText),
    'Service worker must not reference the removed PHP entrypoint.',
  );
};

const verifyCspMetaTag = (indexHtml) => {
  const cspContent = extractCspMetaContent(indexHtml);
  assertCspEquivalent(cspContent, DOCUMENT_CSP, 'Content-Security-Policy meta tag');
};

const verifyApacheSecurityHeaders = (htaccessText) => {
  assert(
    /^\s*DirectoryIndex\s+index\.html\s*$/imu.test(htaccessText),
    'Apache security configuration must use the static index.html entrypoint.',
  );

  const apacheCsp = extractApacheHeaderValue(htaccessText, 'Content-Security-Policy');
  assertCspEquivalent(apacheCsp, PRODUCTION_CSP, 'Apache Content-Security-Policy header');

  for (const [headerName, expectedValue] of Object.entries(SECURITY_RESPONSE_HEADERS)) {
    if (headerName === 'Content-Security-Policy') {
      continue;
    }

    const actualValue = extractApacheHeaderValue(htaccessText, headerName);
    assert(
      actualValue === expectedValue,
      `Apache header "${headerName}" must be "${expectedValue}".`,
    );
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const distDir = path.resolve(process.cwd(), args.dist);
  const indexPath = path.join(distDir, 'index.html');
  const manifestPath = path.join(distDir, 'manifest.webmanifest');
  const htaccessPath = path.join(distDir, '.htaccess');

  const indexHtml = readTextFile(indexPath);
  const manifestText = readTextFile(manifestPath);
  const htaccessText = readTextFile(htaccessPath);

  verifyCspMetaTag(indexHtml);
  verifyApacheSecurityHeaders(htaccessText);
  verifyAbsolutePathReferences(indexHtml, args.base);
  verifyNoRootPathLeakage(distDir, args.base);
  verifyManifest(manifestText, args.base);
  verifyServiceWorkerRegistration(distDir, args.base);
  verifyServiceWorkerNavigationFallback(distDir);

  console.log(
    `[verify-build-channel] ${args.channel} build output is valid for base path ${args.base}`,
  );
};

main();
