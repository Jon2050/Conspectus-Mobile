#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeBasePath } from './deploy-utils.mjs';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const DEFAULT_DIST_DIRECTORY = 'dist';

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webm', 'video/webm'],
]);

export const resolveRequestPath = (requestPathname, basePath) => {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedBasePathWithoutTrailingSlash =
    normalizedBasePath === '/' ? normalizedBasePath : normalizedBasePath.slice(0, -1);
  const normalizedPathname = requestPathname || '/';

  if (
    normalizedBasePath !== '/' &&
    normalizedPathname !== normalizedBasePathWithoutTrailingSlash &&
    normalizedPathname !== normalizedBasePath &&
    !normalizedPathname.startsWith(normalizedBasePath)
  ) {
    return null;
  }

  let relativePath = '';
  if (normalizedBasePath === '/') {
    relativePath = normalizedPathname.slice(1);
  } else if (
    normalizedPathname !== normalizedBasePath &&
    normalizedPathname !== normalizedBasePathWithoutTrailingSlash
  ) {
    relativePath = normalizedPathname.slice(normalizedBasePath.length).replace(/^\/+/, '');
  }

  if (!relativePath) {
    return 'index.html';
  }

  const pathSegments = [];
  for (const segment of relativePath.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      return null;
    }

    pathSegments.push(segment);
  }

  if (pathSegments.length === 0) {
    return 'index.html';
  }

  const resolvedPath = pathSegments.join('/');
  if (path.posix.extname(resolvedPath)) {
    return resolvedPath;
  }

  return 'index.html';
};

const readFileBuffer = (filePath) => fs.readFileSync(filePath);

const resolveContentType = (filePath) =>
  MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream';

const createServer = ({ basePath, distDirectoryPath }) =>
  http.createServer((request, response) => {
    if (!request.url) {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`);
    const resolvedRelativePath = resolveRequestPath(requestUrl.pathname, basePath);
    if (!resolvedRelativePath) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    const absoluteFilePath = path.resolve(distDirectoryPath, resolvedRelativePath);
    if (!absoluteFilePath.startsWith(distDirectoryPath)) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    if (!fs.existsSync(absoluteFilePath) || fs.statSync(absoluteFilePath).isDirectory()) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': resolveContentType(absoluteFilePath),
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(readFileBuffer(absoluteFilePath));
  });

const main = () => {
  const basePath = normalizeBasePath(process.env.PLAYWRIGHT_APP_BASE_PATH ?? '/');
  const distDirectoryPath = path.resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_DIST_DIR ?? DEFAULT_DIST_DIRECTORY,
  );
  const host = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? DEFAULT_HOST;
  const port = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? DEFAULT_PORT);

  if (!fs.existsSync(distDirectoryPath)) {
    throw new Error(`Static dist directory does not exist: ${distDirectoryPath}`);
  }

  const server = createServer({ basePath, distDirectoryPath });
  server.listen(port, host, () => {
    console.log(
      `[serve-static-dist] Serving ${distDirectoryPath} at http://${host}:${port}${basePath}`,
    );
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
