import { describe, expect, it } from 'vitest';

// @ts-expect-error -- .mjs import has no type declarations
import { createResponseHeaders, resolveRequestPath } from './serve-static-dist.mjs';
import { PRODUCTION_CSP } from './security-policy.mjs';

describe('resolveRequestPath', () => {
  it('serves index.html for the configured base path root', () => {
    expect(
      resolveRequestPath('/Conspectus-Mobile/previews/test/', '/Conspectus-Mobile/previews/test/'),
    ).toBe('index.html');
  });

  it('simulates the hosted PHP app-shell response for service worker precaching', () => {
    expect(resolveRequestPath('/conspectus/webapp/index.php', '/conspectus/webapp/')).toBe(
      'index.html',
    );
  });

  it('serves index.html for the configured base path without trailing slash', () => {
    expect(
      resolveRequestPath('/Conspectus-Mobile/previews/test', '/Conspectus-Mobile/previews/test/'),
    ).toBe('index.html');
  });

  it('serves nested asset files below the configured base path', () => {
    expect(
      resolveRequestPath(
        '/Conspectus-Mobile/previews/test/assets/index.js',
        '/Conspectus-Mobile/previews/test/',
      ),
    ).toBe('assets/index.js');
  });

  it('maps client-side routes without file extensions back to index.html', () => {
    expect(
      resolveRequestPath(
        '/Conspectus-Mobile/previews/test/accounts',
        '/Conspectus-Mobile/previews/test/',
      ),
    ).toBe('index.html');
  });

  it('rejects requests outside the configured base path', () => {
    expect(
      resolveRequestPath('/conspectus/webapp/', '/Conspectus-Mobile/previews/test/'),
    ).toBeNull();
  });

  it('rejects directory traversal attempts', () => {
    expect(
      resolveRequestPath(
        '/Conspectus-Mobile/previews/test/../../secrets.txt',
        '/Conspectus-Mobile/previews/test/',
      ),
    ).toBeNull();
  });
});

describe('createResponseHeaders', () => {
  it('serves the canonical production security headers', () => {
    expect(createResponseHeaders('text/html; charset=utf-8')).toMatchObject({
      'Content-Security-Policy': PRODUCTION_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Type': 'text/html; charset=utf-8',
    });
  });
});
