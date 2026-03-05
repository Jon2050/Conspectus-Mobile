#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const REQUIRED_ARGS = new Set(['baseUrl', 'commitSha', 'deployRunId']);
const REQUIRED_MONEYBAG_ICON_SPECS = [
  { src: 'icons/moneysack192x192.png', sizes: '192x192' },
  { src: 'icons/moneysack512x512.png', sizes: '512x512' },
];
const REQUIRED_APPLE_TOUCH_ICON = 'icons/moneysack180x180.png';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const normalizeBaseUrl = (value) => {
  const trimmedValue = value.trim();
  assert(trimmedValue.length > 0, 'Missing required --base-url argument.');
  assert(
    trimmedValue.startsWith('https://'),
    `Invalid --base-url value "${trimmedValue}". Use an absolute https URL.`,
  );
  return trimmedValue.endsWith('/') ? trimmedValue : `${trimmedValue}/`;
};

export const parseArgs = (argv) => {
  const args = {
    baseUrl: '',
    commitSha: '',
    deployRunId: '',
    maxAttempts: '24',
    retryDelaySeconds: '10',
    requestTimeoutMs: '10000',
    skipSecurityHeaderChecks: 'false',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!(key in args)) {
      continue;
    }

    args[key] = argv[index + 1] ?? '';
    index += 1;
  }

  for (const requiredArg of REQUIRED_ARGS) {
    assert(args[requiredArg], `Missing required --${requiredArg} argument.`);
  }

  const maxAttempts = Number(args.maxAttempts);
  const retryDelaySeconds = Number(args.retryDelaySeconds);
  const requestTimeoutMs = Number(args.requestTimeoutMs);
  const normalizedSkipSecurityHeaderChecks = args.skipSecurityHeaderChecks.trim().toLowerCase();

  assert(
    Number.isInteger(maxAttempts) && maxAttempts > 0,
    '--max-attempts must be a positive integer.',
  );
  assert(
    Number.isInteger(retryDelaySeconds) && retryDelaySeconds >= 0,
    '--retry-delay-seconds must be a non-negative integer.',
  );
  assert(
    Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0,
    '--request-timeout-ms must be a positive integer.',
  );
  assert(
    normalizedSkipSecurityHeaderChecks === 'true' || normalizedSkipSecurityHeaderChecks === 'false',
    '--skip-security-header-checks must be "true" or "false".',
  );

  return {
    baseUrl: normalizeBaseUrl(args.baseUrl),
    commitSha: args.commitSha,
    deployRunId: args.deployRunId,
    maxAttempts,
    retryDelaySeconds,
    requestTimeoutMs,
    skipSecurityHeaderChecks: normalizedSkipSecurityHeaderChecks === 'true',
  };
};

const buildContextLabel = ({ commitSha, deployRunId }) =>
  `commitSha=${commitSha} deployRunId=${deployRunId}`;

const toPathname = (urlOrPath, baseUrl) => new URL(urlOrPath, baseUrl).pathname;

const ensureSecurityHeaders = (headers, checkName) => {
  const contentSecurityPolicy = headers.get('content-security-policy');
  assert(
    typeof contentSecurityPolicy === 'string' && contentSecurityPolicy.trim().length > 0,
    `${checkName} response missing required Content-Security-Policy header.`,
  );

  const xContentTypeOptions = headers.get('x-content-type-options');
  assert(
    typeof xContentTypeOptions === 'string' &&
      xContentTypeOptions.trim().toLowerCase() === 'nosniff',
    `${checkName} response must set X-Content-Type-Options to "nosniff".`,
  );

  const referrerPolicy = headers.get('referrer-policy');
  assert(
    typeof referrerPolicy === 'string' && referrerPolicy.trim().length > 0,
    `${checkName} response missing required Referrer-Policy header.`,
  );
};

const ensureBootstrapMarkers = (html, options) => {
  assert(
    /id=["']app["']/.test(html),
    'HTML bootstrap sanity check failed: missing app root element id="app".',
  );
  assert(
    /<script\b[^>]*type=["']module["'][^>]*>/i.test(html),
    'HTML bootstrap sanity check failed: missing module bootstrap script tag.',
  );
  assert(
    /<link\b[^>]*rel=["']apple-touch-icon["'][^>]*>/i.test(html),
    'HTML bootstrap sanity check failed: missing moneybag apple-touch-icon link.',
  );

  const appleTouchIconTag =
    html.match(/<link\b[^>]*rel=["']apple-touch-icon["'][^>]*>/i)?.[0] ?? '';
  const appleTouchIconHref = appleTouchIconTag.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';
  assert(
    appleTouchIconHref.length > 0,
    'HTML bootstrap sanity check failed: apple-touch-icon is missing href.',
  );

  const resolvedAppleTouchIconUrl = new URL(appleTouchIconHref, options.baseUrl).toString();
  const expectedAppleTouchIconUrl = new URL(REQUIRED_APPLE_TOUCH_ICON, options.baseUrl).toString();
  assert(
    resolvedAppleTouchIconUrl === expectedAppleTouchIconUrl,
    `apple-touch-icon href mismatch. Expected "${expectedAppleTouchIconUrl}", got "${resolvedAppleTouchIconUrl}".`,
  );

  return resolvedAppleTouchIconUrl;
};

const ensureDeployIdentity = (metadataText, options) => {
  let metadata;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    throw new Error('deploy-metadata is not valid JSON.');
  }

  const expectedBasePath = new URL(options.baseUrl).pathname;
  assert(
    metadata.basePath === expectedBasePath,
    `deploy-metadata basePath mismatch. Expected "${expectedBasePath}", got "${metadata.basePath}".`,
  );
  assert(
    String(metadata.commitSha) === options.commitSha,
    `deploy-metadata commitSha mismatch. Expected "${options.commitSha}", got "${metadata.commitSha}".`,
  );
  assert(
    String(metadata.deployRunId) === options.deployRunId,
    `deploy-metadata deployRunId mismatch. Expected "${options.deployRunId}", got "${metadata.deployRunId}".`,
  );
};

const ensureManifestInstallability = (manifestText, options) => {
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('manifest is not valid JSON.');
  }

  const expectedBasePath = new URL(options.baseUrl).pathname;
  assert(
    manifest.start_url === expectedBasePath,
    `manifest start_url mismatch. Expected "${expectedBasePath}", got "${manifest.start_url}".`,
  );
  assert(
    manifest.scope === expectedBasePath,
    `manifest scope mismatch. Expected "${expectedBasePath}", got "${manifest.scope}".`,
  );

  const rawIcons = Array.isArray(manifest.icons) ? manifest.icons : [];
  assert(rawIcons.length > 0, 'manifest is missing icons entries.');

  const iconEntries = rawIcons.map((icon) => {
    const src = typeof icon?.src === 'string' ? icon.src.trim() : '';
    const sizes = typeof icon?.sizes === 'string' ? icon.sizes.trim() : '';
    assert(src.length > 0, 'manifest icon entry is missing src.');
    assert(
      src.includes('moneysack'),
      `manifest icon entry must reference moneybag assets; got "${src}".`,
    );

    return {
      src,
      sizes,
      url: new URL(src, options.baseUrl).toString(),
      pathname: toPathname(src, options.baseUrl),
    };
  });

  for (const requiredIcon of REQUIRED_MONEYBAG_ICON_SPECS) {
    const requiredPathname = toPathname(requiredIcon.src, options.baseUrl);
    const iconMatch = iconEntries.find(
      (entry) => entry.pathname === requiredPathname && entry.sizes === requiredIcon.sizes,
    );
    assert(
      Boolean(iconMatch),
      `manifest missing required icon "${requiredIcon.src}" with sizes "${requiredIcon.sizes}".`,
    );
  }

  return iconEntries.map((entry) => entry.url);
};

const fetchWithTimeout = async (fetchImpl, url, requestTimeoutMs) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,*/*;q=0.9',
      },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const createChecks = (options, setManifestIconUrls, setAppleTouchIconUrl) => [
  {
    name: 'app-route',
    url: options.baseUrl,
    validateResponse: (response) => {
      if (!options.skipSecurityHeaderChecks) {
        ensureSecurityHeaders(response.headers, 'app-route');
      }
    },
    validateBody: (bodyText) => {
      const appleTouchIconUrl = ensureBootstrapMarkers(bodyText, options);
      setAppleTouchIconUrl(appleTouchIconUrl);
    },
  },
  {
    name: 'manifest',
    url: new URL('manifest.webmanifest', options.baseUrl).toString(),
    validateBody: (bodyText) => {
      const manifestIconUrls = ensureManifestInstallability(bodyText, options);
      setManifestIconUrls(manifestIconUrls);
    },
  },
  {
    name: 'service-worker',
    url: new URL('sw.js', options.baseUrl).toString(),
  },
  {
    name: 'deploy-metadata',
    url: new URL('deploy-metadata.json', options.baseUrl).toString(),
    validateBody: (bodyText) => ensureDeployIdentity(bodyText, options),
  },
];

export const runSmokeChecks = async (options, fetchImpl = fetch, sleepImpl = delay) => {
  const contextLabel = buildContextLabel(options);
  let lastErrors = [];

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let manifestIconUrls = [];
    let appleTouchIconUrl = '';
    const checks = createChecks(
      options,
      (iconUrls) => {
        manifestIconUrls = iconUrls;
      },
      (iconUrl) => {
        appleTouchIconUrl = iconUrl;
      },
    );
    lastErrors = [];
    console.log(
      `[verify-production-deploy-smoke] ${contextLabel} starting attempt ${attempt}/${options.maxAttempts}.`,
    );

    for (const check of checks) {
      try {
        const response = await fetchWithTimeout(fetchImpl, check.url, options.requestTimeoutMs);
        assert(response.status === 200, `${check.name} returned HTTP ${response.status}.`);

        if (check.validateResponse) {
          check.validateResponse(response);
        }

        if (check.validateBody) {
          const bodyText = await response.text();
          check.validateBody(bodyText);
        }

        console.log(
          `[verify-production-deploy-smoke] ${contextLabel} check=${check.name} status=${response.status} url=${check.url}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const checkError = `check=${check.name} url=${check.url} error="${message}"`;
        lastErrors.push(checkError);
        console.error(`[verify-production-deploy-smoke] ${contextLabel} ${checkError}`);
      }
    }

    if (lastErrors.length === 0) {
      try {
        assert(
          appleTouchIconUrl.length > 0,
          'apple-touch-icon URL missing from bootstrap validation context.',
        );
        const appleTouchIconResponse = await fetchWithTimeout(
          fetchImpl,
          appleTouchIconUrl,
          options.requestTimeoutMs,
        );
        assert(
          appleTouchIconResponse.status === 200,
          `apple-touch-icon returned HTTP ${appleTouchIconResponse.status}.`,
        );
        console.log(
          `[verify-production-deploy-smoke] ${contextLabel} check=apple-touch-icon status=${appleTouchIconResponse.status} url=${appleTouchIconUrl}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const appleIconError = `check=apple-touch-icon url=${appleTouchIconUrl || '(missing)'} error="${message}"`;
        lastErrors.push(appleIconError);
        console.error(`[verify-production-deploy-smoke] ${contextLabel} ${appleIconError}`);
      }
    }

    if (lastErrors.length === 0) {
      for (const iconUrl of manifestIconUrls) {
        try {
          const iconResponse = await fetchWithTimeout(fetchImpl, iconUrl, options.requestTimeoutMs);
          assert(
            iconResponse.status === 200,
            `manifest icon returned HTTP ${iconResponse.status}.`,
          );
          console.log(
            `[verify-production-deploy-smoke] ${contextLabel} check=manifest-icon status=${iconResponse.status} url=${iconUrl}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const iconError = `check=manifest-icon url=${iconUrl} error="${message}"`;
          lastErrors.push(iconError);
          console.error(`[verify-production-deploy-smoke] ${contextLabel} ${iconError}`);
        }
      }
    }

    if (lastErrors.length === 0) {
      console.log(
        `[verify-production-deploy-smoke] ${contextLabel} all deployment smoke checks passed for ${options.baseUrl}`,
      );
      return;
    }

    if (attempt < options.maxAttempts) {
      console.log(
        `[verify-production-deploy-smoke] ${contextLabel} attempt ${attempt}/${options.maxAttempts} failed; retrying in ${options.retryDelaySeconds}s.`,
      );
      await sleepImpl(options.retryDelaySeconds * 1000);
    }
  }

  throw new Error(
    `[verify-production-deploy-smoke] ${contextLabel} failed after ${options.maxAttempts} attempt(s). Last errors: ${lastErrors.join(' | ')}`,
  );
};

export const main = async (argv = process.argv.slice(2)) => {
  const options = parseArgs(argv);
  await runSmokeChecks(options);
};

const isCliInvocation =
  typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCliInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
