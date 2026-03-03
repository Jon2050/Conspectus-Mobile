import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs, runSmokeChecks } from './verify-production-deploy-smoke.mjs';

const baseOptions = {
  baseUrl: 'https://jon2050.de/conspectus/webapp/',
  commitSha: 'abc123',
  deployRunId: '2002',
  maxAttempts: 1,
  retryDelaySeconds: 0,
  requestTimeoutMs: 1000,
};

const appHtml = `<!doctype html>
<html lang="en">
  <head>
    <link rel="apple-touch-icon" sizes="180x180" href="/conspectus/webapp/icons/moneysack180x180.png" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/conspectus/webapp/assets/index.js"></script>
  </body>
</html>`;

const validDeployMetadata = JSON.stringify({
  channel: 'production',
  basePath: '/conspectus/webapp/',
  commitSha: 'abc123',
  deployRunId: '2002',
});

const asResponse = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;
type MockHttpResponse = {
  status: number;
  body: string;
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
      return asResponse(response.status, response.body);
    }

    return asResponse(404, 'not found');
  }) as FetchMock;

const createHealthyResponses = (): Record<string, MockHttpResponse> => ({
  'https://jon2050.de/conspectus/webapp/': {
    status: 200,
    body: appHtml,
  },
  'https://jon2050.de/conspectus/webapp/manifest.webmanifest': {
    status: 200,
    body: JSON.stringify({
      start_url: '/conspectus/webapp/',
      scope: '/conspectus/webapp/',
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
          src: 'icons/moneysack256_256.png',
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
  'https://jon2050.de/conspectus/webapp/sw.js': {
    status: 200,
    body: 'self.addEventListener("install", () => {});',
  },
  'https://jon2050.de/conspectus/webapp/deploy-metadata.json': {
    status: 200,
    body: validDeployMetadata,
  },
  'https://jon2050.de/conspectus/webapp/icons/moneysack180x180.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://jon2050.de/conspectus/webapp/icons/moneysack64x64.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://jon2050.de/conspectus/webapp/icons/moneysack192x192.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://jon2050.de/conspectus/webapp/icons/moneysack256_256.png': {
    status: 200,
    body: 'icon-bytes',
  },
  'https://jon2050.de/conspectus/webapp/icons/moneysack512x512.png': {
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
    responses['https://jon2050.de/conspectus/webapp/manifest.webmanifest'] = {
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
    responses['https://jon2050.de/conspectus/webapp/sw.js'] = {
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
    responses['https://jon2050.de/conspectus/webapp/'] = {
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
    responses['https://jon2050.de/conspectus/webapp/'] = {
      status: 200,
      body: `<!doctype html>
<html lang="en">
  <body>
    <div id="app"></div>
    <script type="module" src="/conspectus/webapp/assets/index.js"></script>
  </body>
</html>`,
    };
    const fetchMock = createFetchByUrl(responses);
    const sleepMock = vi.fn(async () => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runSmokeChecks(baseOptions, fetchMock, sleepMock)).rejects.toThrow(
      'check=app-route',
    );
  });

  it('fails when apple touch icon URL is not reachable', async () => {
    const responses = createHealthyResponses();
    responses['https://jon2050.de/conspectus/webapp/icons/moneysack180x180.png'] = {
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
    responses['https://jon2050.de/conspectus/webapp/deploy-metadata.json'] = {
      status: 200,
      body: JSON.stringify({
        basePath: '/conspectus/webapp/',
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
      if (resolvedUrl === 'https://jon2050.de/conspectus/webapp/manifest.webmanifest') {
        manifestAttempts += 1;
        if (manifestAttempts === 1) {
          return asResponse(503, 'temporarily unavailable');
        }
      }

      const response = responses[resolvedUrl];
      if (response) {
        return asResponse(response.status, response.body);
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
    responses['https://jon2050.de/conspectus/webapp/manifest.webmanifest'] = {
      status: 200,
      body: JSON.stringify({
        start_url: '/conspectus/webapp/',
        scope: '/conspectus/webapp/',
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
    responses['https://jon2050.de/conspectus/webapp/icons/moneysack512x512.png'] = {
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
      'https://jon2050.de/conspectus/webapp',
      '--commit-sha',
      'abc123',
      '--deploy-run-id',
      '2002',
    ]);

    expect(args).toEqual({
      baseUrl: 'https://jon2050.de/conspectus/webapp/',
      commitSha: 'abc123',
      deployRunId: '2002',
      maxAttempts: 24,
      retryDelaySeconds: 10,
      requestTimeoutMs: 10000,
    });
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
