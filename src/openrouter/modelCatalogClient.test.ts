// Verifies authenticated no-store catalog requests and key-safe OpenRouter error normalization.
import { describe, expect, it, vi } from 'vitest';

import {
  OPENROUTER_USER_MODELS_URL,
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

describe('createOpenRouterModelCatalogClient', () => {
  it('aborts the pending request with the caller and never retries', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const controller = new AbortController();
    const request = createOpenRouterModelCatalogClient({ fetch: fetchMock }).load(
      'secret',
      controller.signal,
    );
    const rejected = expect(request).rejects.toMatchObject({ code: 'aborted' });
    controller.abort();
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [, init] of fetchMock.mock.calls) expect(init?.signal?.aborted).toBe(true);
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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it('sends a bodyless authenticated GET without caching or credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => catalogResponse());
    const client = createOpenRouterModelCatalogClient({ fetch: fetchMock });

    await expect(client.load('  secret-api-key  ')).resolves.toMatchObject({
      transferModels: [
        { id: 'provider/model:free' },
        { id: 'meta/muse-spark-1.3-contributor', paid: true },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
