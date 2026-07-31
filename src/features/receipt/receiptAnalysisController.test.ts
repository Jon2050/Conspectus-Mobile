// Verifies live model rechecks, request separation, exact two-stage validation, and transient cleanup.
import { describe, expect, it, vi } from 'vitest';
import {
  OpenRouterChatCompletionError,
  type OpenRouterChatCompletionErrorCode,
  type OpenRouterChatCompletionClient,
  type OpenRouterCompatibleModelCatalog,
  type OpenRouterModelCatalogClient,
} from '@openrouter';

import { createReceiptAnalysisController } from './receiptAnalysisController';
import type { ReadyOpenRouterReceiptConfiguration } from './openRouterReceiptConfiguration';
import type { NormalizedReceiptImage } from './receiptImageNormalization';
import {
  DEFAULT_TRANSFER_DERIVATION_PROMPT,
  RECEIPT_EXTRACTION_SYSTEM_PROMPT,
} from './receiptPrompts';

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
  receiptTotalCents: 350,
  transfers: [
    {
      name: 'Lebensmittel',
      amountCents: 350,
      categoryNames: ['Einkauf', 'Lebensmittel'],
      buyplace: 'Markt',
      receiptDate: '2026-07-31',
      sourceItemIndexes: [0, 1, 2],
    },
  ],
});

const CONFIGURATION: ReadyOpenRouterReceiptConfiguration = {
  apiKey: 'secret-key',
  visionModelId: 'shared-model',
  transferModelId: 'shared-model',
  extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  transferPrompt: DEFAULT_TRANSFER_DERIVATION_PROMPT.text,
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
        transferPrompt:
          'Transfername "Lebensmittel"; categoryNames exakt ["Einkauf", "Lebensmittel"].',
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
      responseFormat: { name: 'receipt_transfer_derivation' },
    });
    expect(JSON.stringify(secondRequest)).not.toContain('image/jpeg');
    expect(JSON.stringify(secondRequest)).not.toContain('accountId');
    expect(receiptImage.bytes.every((value) => value === 0)).toBe(true);
    expect(controller.getState()).toMatchObject({
      phase: 'succeeded',
      errorCode: null,
      derivation: { status: 'ok', receiptTotalCents: 350 },
    });
  });

  it('rejects an unverifiable custom mapping prompt before transmitting the receipt image', async () => {
    const catalogClient: OpenRouterModelCatalogClient = {
      load: vi.fn().mockResolvedValue(catalog()),
    };
    const completionClient: OpenRouterChatCompletionClient = {
      complete: vi.fn(),
    };
    const controller = createReceiptAnalysisController({ catalogClient, completionClient });
    const receiptImage = image();

    await expect(
      controller.start(
        input(receiptImage, {
          ...CONFIGURATION,
          transferPrompt: 'Transfername " Lebensmittel "; categoryNames exakt ["Einkauf"].',
        }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Receipt derivation failed (invalid_prompt).');

    expect(catalogClient.load).not.toHaveBeenCalled();
    expect(completionClient.complete).not.toHaveBeenCalled();
    expect(receiptImage.bytes.every((value) => value === 0)).toBe(true);
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      stage: 'derivation',
      errorCode: 'invalid_prompt',
      derivation: null,
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

  it('surfaces a bounded model reason and never starts stage two after model-declared failure', async () => {
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
        transferPrompt:
          'Transfername "Lebensmittel"; categoryNames exakt ["Einkauf", "Lebensmittel"].',
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
        transferPrompt:
          'Transfername "Lebensmittel"; categoryNames exakt ["Einkauf", "Lebensmittel"].',
      }),
      new AbortController().signal,
    );

    controller.reset();

    expect(controller.getState()).toEqual({
      phase: 'idle',
      stage: null,
      errorCode: null,
      errorReason: null,
      derivation: null,
    });
  });
});
