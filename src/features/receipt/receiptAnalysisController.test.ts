// Verifies live model rechecks, request separation, exact two-stage validation, and transient cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterChatCompletionError,
  OpenRouterCatalogError,
  type OpenRouterChatCompletionErrorCode,
  type OpenRouterChatCompletionClient,
  type OpenRouterCompatibleModelCatalog,
  type OpenRouterModelCatalogClient,
} from '@openrouter';

import { createReceiptAnalysisController } from './receiptAnalysisController';
import type { ReadyOpenRouterReceiptConfiguration } from './openRouterReceiptConfiguration';
import type { NormalizedReceiptImage } from './receiptImageNormalization';
import {
  DEFAULT_TRANSFER_DERIVATION_RULES,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  TRANSFER_DERIVATION_SYSTEM_PROMPT,
} from './prompts';

const EXTRACTION = JSON.stringify({
  status: 'ok',
  errorReason: null,
  storeName: 'Markt',
  receiptDate: '2026-07-31',
  currency: 'EUR',
  receiptTotalCents: 350,
  items: [
    {
      index: 0,
      name: 'Brot',
      quantityText: null,
      lineTotalCents: 250,
      kind: 'item',
    },
    {
      index: 1,
      name: 'Rabatt',
      quantityText: null,
      lineTotalCents: -50,
      kind: 'discount',
    },
    {
      index: 2,
      name: 'Apfel',
      quantityText: '1 kg',
      lineTotalCents: 150,
      kind: 'item',
    },
  ],
});

const DERIVATION = JSON.stringify({
  status: 'ok',
  errorReason: null,
  buyplace: 'Markt',
  transfers: [
    {
      name: 'Brot und Äpfel',
      amountCents: 350,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      sourceItemIndexes: [0, 1, 2],
    },
  ],
});

const CONFIGURATION: ReadyOpenRouterReceiptConfiguration = {
  apiKey: 'secret-key',
  visionModelId: 'shared-model',
  transferModelId: 'shared-model',
  extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  transferPrompt: TRANSFER_DERIVATION_SYSTEM_PROMPT,
  transferRules: DEFAULT_TRANSFER_DERIVATION_RULES.text,
};

const catalog = (overrides: Partial<OpenRouterCompatibleModelCatalog> = {}) => ({
  visionModels: [{ id: 'shared-model', name: 'Shared', label: 'Shared' }],
  transferModels: [{ id: 'shared-model', name: 'Shared', label: 'Shared' }],
  ...overrides,
});

const image = (bytes = new Uint8Array([1, 2, 3, 4])): NormalizedReceiptImage => ({
  mimeType: 'image/jpeg',
  bytes,
  width: 800,
  height: 1200,
});

const input = (
  receiptImage: NormalizedReceiptImage,
  configuration: ReadyOpenRouterReceiptConfiguration = CONFIGURATION,
) => ({ image: receiptImage, configuration });

describe('receipt analysis controller', () => {
  it('selects enabled minimum reasoning independently from each freshly loaded role catalog', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi
        .fn()
        .mockResolvedValueOnce(
          catalog({
            visionModels: [
              {
                id: 'shared-model',
                name: 'Vision',
                label: 'Vision',
                reasoning: {
                  mandatory: false,
                  supportedEfforts: ['high', 'low', 'none'],
                  defaultEnabled: false,
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          catalog({
            transferModels: [
              {
                id: 'shared-model',
                name: 'Text',
                label: 'Text',
                reasoning: {
                  mandatory: true,
                  supportedEfforts: ['high', 'medium'],
                },
              },
            ],
          }),
        ),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValueOnce(EXTRACTION).mockResolvedValueOnce(DERIVATION),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    await controller.start(input(image()), new AbortController().signal);
    expect(vi.mocked(completionClient.complete).mock.calls[0]?.[0].reasoning).toEqual({
      enabled: true,
      effort: 'low',
    });
    expect(vi.mocked(completionClient.complete).mock.calls[1]?.[0].reasoning).toEqual({
      enabled: true,
      effort: 'medium',
    });
  });
  it('keeps partial extraction and derivation fields in review after a model-declared error', async () => {
    const extraction = {
      ...JSON.parse(EXTRACTION),
      status: 'error',
      errorReason: 'Bon-Summe fehlt.',
      receiptTotalCents: null,
    };
    const derivation = {
      ...JSON.parse(DERIVATION),
      status: 'error',
      errorReason: 'Nur Teilantwort.',
      buyplace: 'Rewe',
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(extraction))
        .mockResolvedValueOnce(JSON.stringify(derivation)),
    };
    const controller = createReceiptAnalysisController({
      catalogClient: { load: vi.fn().mockResolvedValue(catalog()) },
      completionClient,
    });
    await expect(
      controller.start(input(image()), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'model_error' });
    expect(completionClient.complete).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      derivation: null,
      review: {
        receiptDate: '2026-07-31',
        buyplace: 'Rewe',
        receiptTotalCents: null,
        transfers: [{ amountCents: 350 }],
      },
    });
  });
  it('retains typed suggestions rejected for arithmetic without accepting a mistaken model ok', async () => {
    const wrong = JSON.parse(DERIVATION);
    wrong.transfers[0].amountCents = 351;
    const controller = createReceiptAnalysisController({
      catalogClient: { load: vi.fn().mockResolvedValue(catalog()) },
      completionClient: {
        complete: vi
          .fn()
          .mockResolvedValueOnce(EXTRACTION)
          .mockResolvedValueOnce(JSON.stringify(wrong)),
      },
    });
    await expect(
      controller.start(input(image()), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      derivation: null,
      review: { receiptDate: '2026-07-31', buyplace: 'Markt', transfers: [{ amountCents: 351 }] },
    });
    controller.reset();
    expect(controller.getState().review).toBeNull();
  });
  it('reports catalog rate limiting without retrying or sending the image', async () => {
    const catalogClient = {
      load: vi.fn().mockRejectedValue(new OpenRouterCatalogError('provider_error', 429)),
    };
    const completionClient = { complete: vi.fn() };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    const photo = image();
    await expect(
      controller.start(input(photo), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    expect(catalogClient.load).toHaveBeenCalledOnce();
    expect(completionClient.complete).not.toHaveBeenCalled();
    expect(photo.bytes.every((byte) => byte === 0)).toBe(true);
  });
  it('rechecks each role, sends the image only to stage one, and retains only validated derivation', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi.fn().mockResolvedValue(catalog()),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValueOnce(EXTRACTION).mockResolvedValueOnce(DERIVATION),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    const receiptImage = image();

    await controller.start(
      input(receiptImage, {
        ...CONFIGURATION,
        transferRules: '- Lebensmittel kommen in die Kategorien [Einkauf], [Lebensmittel].',
      }),
      new AbortController().signal,
    );

    expect(catalogClient.load).toHaveBeenCalledTimes(2);
    expect(catalogClient.load).toHaveBeenNthCalledWith(1, 'secret-key', expect.any(AbortSignal));
    expect(catalogClient.load).toHaveBeenNthCalledWith(2, 'secret-key', expect.any(AbortSignal));
    expect(completionClient.complete).toHaveBeenCalledTimes(2);
    const firstRequest = vi.mocked(completionClient.complete).mock.calls[0]?.[0];
    const secondRequest = vi.mocked(completionClient.complete).mock.calls[1]?.[0];
    expect(firstRequest).toMatchObject({ model: 'shared-model' });
    expect(JSON.stringify(firstRequest)).toContain('image/jpeg');
    expect(JSON.stringify(firstRequest)).not.toContain('"storeName":"Markt"');
    expect(secondRequest).toMatchObject({
      model: 'shared-model',
    });
    expect(secondRequest).not.toHaveProperty('responseFormat');
    expect(JSON.stringify(secondRequest)).toContain('BENUTZERDEFINIERTE GRUPPIERUNGSREGELN');
    expect(JSON.stringify(secondRequest)).toContain(
      '- Lebensmittel kommen in die Kategorien [Einkauf], [Lebensmittel].',
    );
    expect(JSON.stringify(secondRequest)).not.toContain('image/jpeg');
    expect(JSON.stringify(secondRequest)).not.toContain('accountId');
    expect(receiptImage.bytes.every((value) => value === 0)).toBe(true);
    expect(controller.getState()).toMatchObject({
      phase: 'succeeded',
      errorCode: null,
      derivation: { status: 'ok', receiptTotalCents: 350 },
      extractedItemIndexes: [0, 1, 2],
    });
  });

  it('passes opaque custom grouping rules to stage two without app-side interpretation', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi.fn().mockResolvedValue(catalog()),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValueOnce(EXTRACTION).mockResolvedValueOnce(DERIVATION),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    const receiptImage = image();

    const opaqueRules = 'Sort items however these free-form instructions describe.';
    await controller.start(
      input(receiptImage, {
        ...CONFIGURATION,
        transferRules: opaqueRules,
      }),
      new AbortController().signal,
    );

    expect(catalogClient.load).toHaveBeenCalledTimes(2);
    expect(completionClient.complete).toHaveBeenCalledTimes(2);
    const secondRequest = vi.mocked(completionClient.complete).mock.calls[1]?.[0];
    expect(JSON.stringify(secondRequest)).toContain(opaqueRules);
    expect(receiptImage.bytes.every((value) => value === 0)).toBe(true);
    expect(controller.getState()).toMatchObject({
      phase: 'succeeded',
      errorCode: null,
      derivation: { status: 'ok' },
    });
  });

  it('stops before image transmission when the fresh catalog rejects the selected vision model', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi.fn().mockResolvedValue(catalog({ visionModels: [] })),
    };
    const completionClient: OpenRouterChatCompletionClient = { complete: vi.fn() };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    const receiptImage = image();

    await expect(
      controller.start(input(receiptImage), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'model_unavailable', stage: 'extraction' });

    expect(completionClient.complete).not.toHaveBeenCalled();
    expect(receiptImage.bytes.every((value) => value === 0)).toBe(true);
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      stage: 'extraction',
      errorCode: 'model_unavailable',
      derivation: null,
    });
  });

  it('surfaces a bounded model reason and stops when no readable items remain', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi.fn().mockResolvedValue(catalog()),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          status: 'error',
          errorReason: 'Der Gesamtbetrag ist nicht eindeutig lesbar.',
          storeName: null,
          receiptDate: null,
          currency: null,
          receiptTotalCents: null,
          items: [],
        }),
      ),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });

    await expect(
      controller.start(input(image()), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'model_error', stage: 'extraction' });

    expect(catalogClient.load).toHaveBeenCalledOnce();
    expect(completionClient.complete).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      errorCode: 'model_error',
      errorReason: 'Der Gesamtbetrag ist nicht eindeutig lesbar.',
      derivation: null,
    });
  });

  it('rechecks stage-two eligibility after extraction and stops before sending extracted data', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi
        .fn()
        .mockResolvedValueOnce(catalog())
        .mockResolvedValueOnce(catalog({ transferModels: [] })),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValue(EXTRACTION),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });

    await expect(
      controller.start(input(image()), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'model_unavailable', stage: 'derivation' });

    expect(catalogClient.load).toHaveBeenCalledTimes(2);
    expect(completionClient.complete).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      stage: 'derivation',
      errorCode: 'model_unavailable',
      derivation: null,
    });
  });

  it.each<[OpenRouterChatCompletionErrorCode, string]>([
    ['auth_error', 'auth_error'],
    ['rate_limited', 'rate_limited'],
    ['network_error', 'network_error'],
    ['timeout', 'timeout'],
    ['refusal', 'refusal'],
    ['provider_error', 'provider_error'],
    ['invalid_response', 'invalid_response'],
    ['over_limit', 'output_limit'],
  ])(
    'normalizes completion failure %s without provider details',
    async (providerCode, expectedCode) => {
      const catalogClient: OpenRouterModelCatalogClient = {
        load: vi.fn().mockResolvedValue(catalog()),
      };
      const completionClient: OpenRouterChatCompletionClient = {
        complete: vi.fn().mockRejectedValue(new OpenRouterChatCompletionError(providerCode, 503)),
      };
      const controller = createReceiptAnalysisController({ catalogClient, completionClient });

      await expect(
        controller.start(input(image()), new AbortController().signal),
      ).rejects.toMatchObject({ code: expectedCode, stage: 'extraction', reason: null });
      expect(JSON.stringify(controller.getState())).not.toContain('secret-key');
      expect(JSON.stringify(controller.getState())).not.toContain('503');
    },
  );

  it('aborts stale work and prevents an older run from replacing a newer result', async () => {
    let resolveFirstCatalog: (value: OpenRouterCompatibleModelCatalog) => void = () => {};
    const firstCatalog = new Promise<OpenRouterCompatibleModelCatalog>((resolve) => {
      resolveFirstCatalog = resolve;
    });
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi
        .fn()
        .mockReturnValueOnce(firstCatalog)
        .mockResolvedValueOnce(catalog())
        .mockResolvedValueOnce(catalog()),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValueOnce(EXTRACTION).mockResolvedValueOnce(DERIVATION),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    const firstImage = image(new Uint8Array([9, 8, 7]));
    const first = controller.start(input(firstImage), new AbortController().signal);
    const second = controller.start(
      input(image(), {
        ...CONFIGURATION,
        transferRules: '- Lebensmittel kommen in die Kategorien [Einkauf], [Lebensmittel].',
      }),
      new AbortController().signal,
    );

    resolveFirstCatalog(catalog());
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toBeUndefined();
    expect(firstImage.bytes.every((value) => value === 0)).toBe(true);
    expect(controller.getState().phase).toBe('succeeded');
  });

  it('reset aborts active work and clears a completed derivation', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi.fn().mockResolvedValue(catalog()),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn().mockResolvedValueOnce(EXTRACTION).mockResolvedValueOnce(DERIVATION),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    await controller.start(
      input(image(), {
        ...CONFIGURATION,
        transferRules: '- Lebensmittel kommen in die Kategorien [Einkauf], [Lebensmittel].',
      }),
      new AbortController().signal,
    );

    controller.reset();

    expect(controller.getState()).toEqual({
      phase: 'idle',
      review: null,
      stage: null,
      errorCode: null,
      errorReason: null,
      derivation: null,
      extractedItemIndexes: null,
    });
  });
});
