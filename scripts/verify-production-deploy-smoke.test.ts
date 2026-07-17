import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs, runSmokeChecks } from './verify-production-deploy-smoke.mjs';
import { DOCUMENT_CSP, PRODUCTION_CSP } from './security-policy.mjs';

const baseOptions = {
  baseUrl: 'https://conspectus.jon2050.de/',
  commitSha: 'abc123',
  deployRunId: '2002',
  maxAttempts: 1,
  retryDelaySeconds: 0,
  requestTimeoutMs: 1000,
  deadlineSeconds: 0,
};

const appHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Security-Policy" content="${DOCUMENT_CSP}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/moneysack180x180.png" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

const validDeployMetadata = JSON.stringify({
  channel: 'production',
  basePath: '/',
  commitSha: 'abc123',
  deployRunId: '2002',
});

const asResponse = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      ...headers,
    },
  });

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;
type MockHttpResponse = {
  status: number;
  body: string;
  headers?: Record<string, string>;
};

const resolveUrl = (input: string | URL | Request) => {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
};

const createFetchByUrl = (responses: Record<string, MockHttpResponse>): FetchMock =>
  vi.fn(async (input: string | URL | Request) => {
    const resolvedUrl = resolveUrl(input);
    const response = responses[resolvedUrl];
    if (response) {
      return asResponse(response.status, response.body, response.headers);
    }

    return asResponse(404, 'not found');
  }) as FetchMock;

const createHealthyResponses = (): Record<string, MockHttpResponse> => ({
  'https://conspectus.jon2050.de/': {
    status: 200,
    body: appHtml,
    headers: {
      'content-security-policy': PRODUCTION_CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  },
  'https://conspectus.jon2050.de/manifest.webmanifest': {
    status: 200,
    body: JSON.stringify({
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: 'icons/moneysack64x64.png',
          sizes: '64x64',
          type: 'image/png',
        },
        {
          src: 'icons/moneysack192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: 'icons/moneysack256x256.png',
          sizes: '256x256',
          type: 'image/png',
        },
        {
          src: 'icons/moneysack512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    }),
  },
  'https://conspectus.jon2050.de/sw.js': {
    status: 200,
    body: 'self.addEventListener("install", () => {});',
  },
  'https://conspectus.jon2050.de/deploy-metadata.json': {
    status: 200,
    body: validDeployMetadata,
  },
  'https://conspectus.jon2050.de/icons/moneysack180x180.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://conspectus.jon2050.de/icons/moneysack64x64.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://conspectus.jon2050.de/icons/moneysack192x192.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://conspectus.jon2050.de/icons/moneysack256x256.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://conspectus.jon2050.de/icons/moneysack512x512.png': {
    status: 200,
    body: 'icon-bytes',
  },
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verify-production-deploy-smoke script', () => {
  it('passes when required deployment URLs are reachable and identity matches', async () => {
    const fetchMock = createFetchByUrl(createHealthyResponses());
    const sleepMock = vi.fn(async () => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(9);
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'commitSha=abc123 deployRunId=2002 all deployment smoke checks passed',
      ),
    );
  });

  it('fails when manifest URL check is not HTTP 200', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/manifest.webmanifest'] = {
      status: 404,
      body: 'missing',
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=manifest',
    );
  });

  it('fails when service worker URL check is not HTTP 200', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/sw.js'] = {
      status: 404,
      body: 'missing',
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=service-worker',
    );
  });

  it('fails HTML sanity check when bootstrap markers are missing', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/'] = {
      status: 200,
      body: '<!doctype html><html><body><main>Missing app root</main></body></html>',
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=app-route',
    );
  });

  it('fails when app route is missing moneybag apple-touch-icon link', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/'] = {
      status: 200,
      body: appHtml.replace(/<link rel="apple-touch-icon"[^>]+\/>/u, ''),
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=app-route',
    );
  });

  it('fails when app-route HTML is missing the Content-Security-Policy meta tag', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/'].body = appHtml.replace(
      /<meta http-equiv="Content-Security-Policy"[^>]+\/>/u,
      '',
    );
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'Content-Security-Policy',
    );
  });

  it('fails when the CSP omits WebAssembly and OneDrive download permissions', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/'].body = appHtml.replace(
      DOCUMENT_CSP,
      "default-src 'self'; script-src 'self'; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com",
    );
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'does not match the canonical security policy',
    );
  });

  it('fails when app-route HTML has an invalid referrer policy', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/'].body = appHtml.replace(
      'strict-origin-when-cross-origin',
      'unsafe-url',
    );
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'referrer policy',
    );
  });

  it('fails when apple touch icon URL is not reachable', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/icons/moneysack180x180.png'] = {
      status: 404,
      body: 'missing',
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=apple-touch-icon',
    );
  });

  it('fails when deploy metadata identity does not match expected deploy context', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/deploy-metadata.json'] = {
      status: 200,
      body: JSON.stringify({
        basePath: '/',
        commitSha: 'different-sha',
        deployRunId: '2002',
      }),
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=deploy-metadata',
    );
  });

  it('retries failed checks and succeeds when a later attempt passes', async () => {
    const responses = createHealthyResponses();
    let manifestAttempts = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const resolvedUrl = resolveUrl(input);
      if (resolvedUrl === 'https://conspectus.jon2050.de/manifest.webmanifest') {
        manifestAttempts += 1;
        if (manifestAttempts === 1) {
          return asResponse(503, 'temporarily unavailable');
        }
      }

      const response = responses[resolvedUrl];
      if (response) {
        return asResponse(response.status, response.body, response.headers);
      }

      return asResponse(404, 'not found');
    }) as FetchMock;
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runSmokeChecks(
        {
          ...baseOptions,
          maxAttempts: 2,
          retryDelaySeconds: 1,
        },
        fetchMock,
        sleepMock,
      ),
    ).resolves.toBeUndefined();
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(1000);
  });

  it('fails when required moneybag manifest icons are missing', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/manifest.webmanifest'] = {
      status: 200,
      body: JSON.stringify({
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/moneysack64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
        ],
      }),
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=manifest',
    );
  });

  it('fails when one manifest icon URL is not reachable', async () => {
    const responses = createHealthyResponses();
    responses['https://conspectus.jon2050.de/icons/moneysack512x512.png'] = {
      status: 404,
      body: 'missing',
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=manifest-icon',
    );
  });

  it('normalizes cli args and applies numeric defaults', () => {
    const args = parseArgs([
      '--base-url',
      'https://conspectus.jon2050.de',
      '--commit-sha',
      'abc123',
      '--deploy-run-id',
      '2002',
    ]);

    expect(args).toEqual({
      baseUrl: 'https://conspectus.jon2050.de/',
      commitSha: 'abc123',
      deployRunId: '2002',
      maxAttempts: 24,
      retryDelaySeconds: 10,
      requestTimeoutMs: 10000,
      deadlineSeconds: 0,
    });
  });

  it('enforces a wall-clock deadline across sequential checks and retries', async () => {
    let currentTimeMs = 0;
    const fetchMock = vi.fn(async () => {
      currentTimeMs += 600;
      return asResponse(503, 'unavailable');
    }) as FetchMock;
    const sleepMock = vi.fn(async (delayMs: number) => {
      currentTimeMs += delayMs;
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runSmokeChecks(
        {
          ...baseOptions,
          maxAttempts: 20,
          retryDelaySeconds: 10,
          deadlineSeconds: 1,
        },
        fetchMock,
        sleepMock,
        () => currentTimeMs,
      ),
    ).rejects.toThrow('exceeded the 1s wall-clock deadline');
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('keeps the timeout active while reading a stalled response body', async () => {
    let bodyRequestWasAborted = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (resolveUrl(input) !== 'https://conspectus.jon2050.de/') {
        return asResponse(503, 'unavailable');
      }

      const stalledBody = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            bodyRequestWasAborted = true;
            controller.error(new DOMException('Request aborted', 'AbortError'));
          });
        },
      });
      return new Response(stalledBody, { status: 200 });
    }) as FetchMock;
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runSmokeChecks(
        {
          ...baseOptions,
          requestTimeoutMs: 20,
          deadlineSeconds: 1,
        },
        fetchMock,
        sleepMock,
      ),
    ).rejects.toThrow('check=app-route');
    expect(bodyRequestWasAborted).toBe(true);
  });

  it('rejects non-https base URLs', () => {
    expect(() =>
      parseArgs([
        '--base-url',
        'http://jon2050.de/conspectus/webapp',
        '--commit-sha',
        'abc123',
        '--deploy-run-id',
        '2002',
      ]),
    ).toThrow('Use an absolute https URL');
  });
});
