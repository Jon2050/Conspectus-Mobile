// Verifies authenticated no-store catalog requests and key-safe OpenRouter error normalization.
import { describe, expect, it, vi } from 'vitest';

import {
  OPENROUTER_USER_MODELS_URL,
  OPENROUTER_INTELLIGENCE_BENCHMARKS_URL,
  OpenRouterCatalogError,
  createOpenRouterModelCatalogClient,
} from './modelCatalogClient';

const catalogResponse = (): Response =>
  new Response(
    JSON.stringify({
      data: [
        {
          id: 'provider/model:free',
          canonical_slug: 'provider/model-snapshot',
          name: 'Free Model',
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          pricing: { prompt: '0', completion: '0' },
          supported_parameters: ['structured_outputs'],
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const benchmarkResponse = () =>
  Response.json({
    data: [
      {
        source: 'artificial-analysis',
        model_permaslug: 'provider/model-snapshot',
        intelligence_index: 20,
      },
    ],
  });

describe('createOpenRouterModelCatalogClient', () => {
  it('starts both GETs before either response resolves', async () => {
    const pending = new Map<string, (response: Response) => void>();
    const fetchMock = vi.fn<typeof fetch>(
      (url) =>
        new Promise((resolve) => {
          pending.set(String(url), resolve);
        }),
    );
    const request = createOpenRouterModelCatalogClient({ fetch: fetchMock }).load('secret');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.get(OPENROUTER_INTELLIGENCE_BENCHMARKS_URL)!(benchmarkResponse());
    pending.get(OPENROUTER_USER_MODELS_URL)!(catalogResponse());
    await expect(request).resolves.toMatchObject({
      transferModels: [{ id: 'provider/model:free' }],
    });
  });

  it('aborts both pending requests with the caller and never retries', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const controller = new AbortController();
    const request = createOpenRouterModelCatalogClient({ fetch: fetchMock }).load(
      'secret',
      controller.signal,
    );
    const rejected = expect(request).rejects.toMatchObject({ code: 'aborted' });
    controller.abort();
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal?.aborted).toBe(true);
  });

  it('cancels the other pending GET when one request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      url === OPENROUTER_USER_MODELS_URL
        ? new Response('unfiltered provider data', { status: 503 })
        : new Promise(() => {}),
    );
    await expect(
      createOpenRouterModelCatalogClient({ fetch: fetchMock }).load('secret'),
    ).rejects.toMatchObject({ code: 'provider_error', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });

  it('bounds stalled response bodies and aborts the fetch signal without retry', async () => {
    vi.useFakeTimers();
    try {
      const response = new Response();
      vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
      const fetchMock = vi.fn<typeof fetch>(async () => response);
      const request = createOpenRouterModelCatalogClient({ fetch: fetchMock, timeoutMs: 100 }).load(
        'secret',
      );
      const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('sends a bodyless authenticated GET without caching or credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      url === OPENROUTER_USER_MODELS_URL ? catalogResponse() : benchmarkResponse(),
    );
    const client = createOpenRouterModelCatalogClient({ fetch: fetchMock });

    await expect(client.load('  secret-api-key  ')).resolves.toMatchObject({
      transferModels: [{ id: 'provider/model:free' }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(OPENROUTER_USER_MODELS_URL);
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer secret-api-key',
      },
    });
    expect(init).not.toHaveProperty('body');
    expect(String(url)).not.toContain('secret-api-key');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(OPENROUTER_INTELLIGENCE_BENCHMARKS_URL);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject(init!);
  });

  it.each([429, 500])('fails closed when benchmark retrieval returns HTTP %s', async (status) => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      url === OPENROUTER_USER_MODELS_URL
        ? catalogResponse()
        : new Response('secret provider details', { status }),
    );
    const client = createOpenRouterModelCatalogClient({ fetch: fetchMock });
    const error = await client.load('secret-key').catch((error: unknown) => error);
    expect(error).toMatchObject({ code: 'provider_error', status });
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled benchmark body with the same whole-load deadline', async () => {
    vi.useFakeTimers();
    try {
      const stalled = new Response();
      vi.spyOn(stalled, 'json').mockImplementation(() => new Promise(() => {}));
      const fetchMock = vi.fn<typeof fetch>(async (url) =>
        url === OPENROUTER_USER_MODELS_URL ? catalogResponse() : stalled,
      );
      const request = createOpenRouterModelCatalogClient({ fetch: fetchMock, timeoutMs: 100 }).load(
        'secret',
      );
      const assertion = expect(request).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([401, 403])(
    'normalizes HTTP %s as an invalid key without response details',
    async (status) => {
      const fetchMock = vi.fn(
        async () => new Response('secret-api-key echoed by provider', { status }),
      );
      const client = createOpenRouterModelCatalogClient({ fetch: fetchMock });

      const error = await client.load('secret-api-key').catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'invalid_key', status });
      expect(JSON.stringify(error)).not.toContain('secret-api-key');
    },
  );

  it('normalizes provider, network, and invalid-response failures without retaining causes', async () => {
    const providerClient = createOpenRouterModelCatalogClient({
      fetch: vi.fn(async () => new Response('provider leaked secret-api-key', { status: 503 })),
    });
    const networkClient = createOpenRouterModelCatalogClient({
      fetch: vi.fn(async () => {
        throw new Error('network leaked secret-api-key');
      }),
    });
    const invalidClient = createOpenRouterModelCatalogClient({
      fetch: vi.fn(async () => new Response('{', { status: 200 })),
    });

    await expect(providerClient.load('secret-api-key')).rejects.toMatchObject({
      code: 'provider_error',
      status: 503,
    });
    await expect(networkClient.load('secret-api-key')).rejects.toMatchObject({
      code: 'network_error',
      status: null,
    });
    await expect(invalidClient.load('secret-api-key')).rejects.toMatchObject({
      code: 'invalid_response',
      status: 200,
    });
  });

  it('rejects an empty key before issuing a request', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => catalogResponse());
    const client = createOpenRouterModelCatalogClient({ fetch: fetchMock });

    await expect(client.load('  ')).rejects.toEqual(expect.any(OpenRouterCatalogError));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
