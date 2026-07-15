// Defines and validates the CSP and response headers required by every PWA deployment channel.
export const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.1drv.com https://*.microsoftpersonalcontent.com",
  "frame-src 'self' https://login.microsoftonline.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const PRODUCTION_CSP = `${DOCUMENT_CSP}; frame-ancestors 'none'`;

export const SECURITY_RESPONSE_HEADERS = Object.freeze({
  'Content-Security-Policy': PRODUCTION_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

const parseCsp = (policyText) => {
  const directives = new Map();

  for (const rawDirective of policyText.split(';')) {
    const tokens = rawDirective.trim().split(/\s+/u).filter(Boolean);
    if (tokens.length === 0) {
      continue;
    }

    const [name, ...sources] = tokens;
    if (directives.has(name)) {
      throw new Error(`Content-Security-Policy contains duplicate directive "${name}".`);
    }

    directives.set(name, sources);
  }

  return directives;
};

const normalizeCsp = (policyText) =>
  [...parseCsp(policyText).entries()]
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, sources]) => `${name} ${[...sources].sort().join(' ')}`)
    .join('; ');

export const assertCspEquivalent = (actualPolicy, expectedPolicy, label) => {
  if (normalizeCsp(actualPolicy) !== normalizeCsp(expectedPolicy)) {
    throw new Error(`${label} does not match the canonical security policy.`);
  }
};

export const extractCspMetaContent = (indexHtml) => {
  const cspMetaTag = indexHtml.match(
    /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/iu,
  )?.[0];

  if (!cspMetaTag) {
    throw new Error('Missing Content-Security-Policy meta tag in index.html.');
  }

  const content =
    cspMetaTag.match(/content="([^"]+)"/iu)?.[1] ??
    cspMetaTag.match(/content='([^']+)'/iu)?.[1] ??
    '';

  if (!content.trim()) {
    throw new Error('Content-Security-Policy meta tag must define a non-empty content value.');
  }

  return content;
};

export const extractApacheHeaderValue = (htaccessText, headerName) => {
  const escapedHeaderName = headerName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = htaccessText.match(
    new RegExp(`Header\\s+always\\s+set\\s+${escapedHeaderName}\\s+"([^"]+)"`, 'iu'),
  );

  if (!match?.[1]) {
    throw new Error(`Apache security configuration is missing header "${headerName}".`);
  }

  return match[1];
};
