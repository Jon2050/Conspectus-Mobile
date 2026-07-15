// Verifies canonical CSP comparison and Apache header extraction for deployment checks.
import { describe, expect, it } from 'vitest';

import {
  assertCspEquivalent,
  DOCUMENT_CSP,
  extractApacheHeaderValue,
  extractCspMetaContent,
} from './security-policy.mjs';

describe('security policy helpers', () => {
  it('treats directive and source ordering as equivalent', () => {
    expect(() =>
      assertCspEquivalent(
        "script-src 'wasm-unsafe-eval' 'self'; default-src 'self'",
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'",
        'Test policy',
      ),
    ).not.toThrow();
  });

  it('rejects a policy that omits a required source', () => {
    expect(() =>
      assertCspEquivalent(
        DOCUMENT_CSP.replace(" 'wasm-unsafe-eval'", ''),
        DOCUMENT_CSP,
        'Test policy',
      ),
    ).toThrow('does not match the canonical security policy');
  });

  it('rejects a policy that blocks the primary web font', () => {
    expect(() =>
      assertCspEquivalent(
        DOCUMENT_CSP.replace(' https://fonts.gstatic.com', ''),
        DOCUMENT_CSP,
        'Test policy',
      ),
    ).toThrow('does not match the canonical security policy');
  });

  it('extracts the CSP meta value from HTML', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="${DOCUMENT_CSP}" />`;

    expect(extractCspMetaContent(html)).toBe(DOCUMENT_CSP);
  });

  it('extracts an Apache response header value', () => {
    const htaccess = 'Header always set X-Content-Type-Options "nosniff"';

    expect(extractApacheHeaderValue(htaccess, 'X-Content-Type-Options')).toBe('nosniff');
  });
});
