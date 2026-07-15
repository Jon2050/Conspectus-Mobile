// Declares the shared deployment security policy helpers for TypeScript-based script tests.
export const DOCUMENT_CSP: string;
export const PRODUCTION_CSP: string;
export const SECURITY_RESPONSE_HEADERS: Readonly<{
  'Content-Security-Policy': string;
  'X-Content-Type-Options': 'nosniff';
  'Referrer-Policy': 'strict-origin-when-cross-origin';
}>;

export function assertCspEquivalent(
  actualPolicy: string,
  expectedPolicy: string,
  label: string,
): void;

export function extractCspMetaContent(indexHtml: string): string;

export function extractApacheHeaderValue(htaccessText: string, headerName: string): string;
export function extractPhpHeaderValue(phpText: string, headerName: string): string;
