// Verifies two completions without metadata requests, partial review, failures and stale-run safety.
import { describe, expect, it, vi } from 'vitest';
import { OpenRouterChatCompletionError, type OpenRouterChatCompletionErrorCode } from '@openrouter';
import { createReceiptAnalysisController } from './receiptAnalysisController';
import { toStoredReadyOpenRouterReceiptConfiguration } from './openRouterReceiptConfiguration';
import { createOpenRouterSettingsStore } from './openRouterSettingsStore';
import { RECEIPT_EXTRACTION_SYSTEM_PROMPT, TRANSFER_DERIVATION_SYSTEM_PROMPT } from './prompts';

const extraction = {
  status: 'ok',
  errorReason: null,
  storeName: 'Markt',
  receiptDate: '2026-07-31',
  currency: 'EUR',
  receiptTotalCents: 350,
  items: [
    { index: 0, name: 'Brot', quantityText: null, lineTotalCents: 250, kind: 'item' },
    { index: 1, name: 'Rabatt', quantityText: null, lineTotalCents: -50, kind: 'discount' },
    { index: 2, name: 'Apfel', quantityText: '1 kg', lineTotalCents: 150, kind: 'item' },
  ],
};
const derivation = {
  status: 'ok',
  errorReason: null,
  buyplace: 'Rewe',
  transfers: [
    {
      name: 'Brot und Äpfel',
      categoryNames: ['Einkauf', 'Lebensmittel'],
      sourceItemIndexes: [0, 1, 2],
    },
  ],
};
const config = {
  apiKey: 'secret-key',
  visionModelId: 'vision',
  transferModelId: 'text',
  extractionPrompt: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
  transferPrompt: TRANSFER_DERIVATION_SYSTEM_PROMPT,
  transferRules: 'Literal $& {{CUSTOM_PROMPT}} user rules',
  visionReasoning: { enabled: true, effort: 'low' as const },
  transferReasoning: { enabled: true, effort: 'medium' as const },
};
const image = () => ({
  mimeType: 'image/jpeg' as const,
  bytes: new Uint8Array([1, 2, 3, 4]),
  width: 800,
  height: 1200,
});
const input = () => ({ configuration: config, image: image() });

describe('receipt analysis controller', () => {
  it('uses stored settings after restart, only two POSTs, separated messages and role-specific minimum reasoning', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    createOpenRouterSettingsStore({ storage }).write('account', {
      apiKey: config.apiKey,
      visionModelId: 'vision',
      transferModelId: 'text',
      transferRulesOverride: config.transferRules,
      visionReasoning: {
        modelId: 'vision',
        capabilities: { mandatory: false, supportedEfforts: ['high', 'low', 'none'] },
      },
      transferReasoning: {
        modelId: 'text',
        capabilities: { mandatory: true, supportedEfforts: ['high', 'medium'] },
      },
    });
    const restored = createOpenRouterSettingsStore({ storage }).read('account')!;
    const configuration = toStoredReadyOpenRouterReceiptConfiguration(restored)!;
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.method).toBe('POST');
      const result = ++calls === 1 ? extraction : derivation;
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
      });
    });
    const { createOpenRouterChatCompletionClient } = await import('@openrouter');
    const controller = createReceiptAnalysisController({
      completionClient: createOpenRouterChatCompletionClient({ fetch: fetchMock }),
    });
    const photo = image();
    const phases: string[] = [];
    controller.subscribe((state) => phases.push(state.phase));
    await controller.start({ configuration, image: photo }, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0].reasoning).toEqual(config.visionReasoning);
    expect(bodies[1].reasoning).toEqual(config.transferReasoning);
    expect(bodies[0].messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
    expect(JSON.stringify(bodies[0])).toContain('data:image/jpeg;base64,');
    expect(JSON.stringify(bodies[1])).not.toContain('data:image/jpeg;base64,');
    expect(bodies[1].messages[0].content).toContain(config.transferRules);
    expect(bodies[1].messages[1].content).toContain(JSON.stringify(extraction));
    expect(phases).toContain('extracting');
    expect(phases).toContain('deriving');
    expect(photo.bytes.every((byte) => byte === 0)).toBe(true);
    expect(controller.getState()).toMatchObject({
      phase: 'succeeded',
      extractedItemIndexes: [0, 1, 2],
      derivation: {
        transfers: [{ amountCents: 350, buyplace: 'Rewe', receiptDate: '2026-07-31' }],
      },
    });
    expect(controller.getState().review?.transfers[0]?.items).toEqual(
      extraction.items.map(({ index, name, lineTotalCents }) => ({ index, name, lineTotalCents })),
    );
    controller.reset();
    expect(controller.getState().review).toBeNull();
  });

  it('preserves readable partial results and locally computed sums without promoting them', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          ...extraction,
          status: 'error',
          errorReason: 'Summe fehlt.',
          receiptTotalCents: null,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ ...derivation, status: 'error', errorReason: 'Teilantwort.' }),
      );
    const controller = createReceiptAnalysisController({ completionClient: { complete } });
    await expect(controller.start(input(), new AbortController().signal)).rejects.toMatchObject({
      code: 'model_error',
      stage: 'derivation',
    });
    expect(controller.getState()).toMatchObject({
      phase: 'error',
      derivation: null,
      review: {
        receiptDate: '2026-07-31',
        receiptTotalCents: null,
        transfers: [
          {
            amountCents: 350,
            items: [
              { index: 0, name: 'Brot', lineTotalCents: 250 },
              { index: 1, name: 'Rabatt', lineTotalCents: -50 },
              { index: 2, name: 'Apfel', lineTotalCents: 150 },
            ],
          },
        ],
      },
    });
  });

  it('retains valid incomplete groups in review after rejecting mistaken complete coverage', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(extraction))
      .mockResolvedValueOnce(
        JSON.stringify({
          ...derivation,
          transfers: [{ ...derivation.transfers[0], sourceItemIndexes: [0] }],
        }),
      );
    const controller = createReceiptAnalysisController({ completionClient: { complete } });
    await expect(controller.start(input(), new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    expect(controller.getState()).toMatchObject({
      derivation: null,
      review: { transfers: [{ amountCents: 250 }] },
    });
  });

  it('does not fabricate review groups from unknown source references', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(extraction))
      .mockResolvedValueOnce(
        JSON.stringify({
          ...derivation,
          transfers: [{ ...derivation.transfers[0], sourceItemIndexes: [999] }],
        }),
      );
    const controller = createReceiptAnalysisController({ completionClient: { complete } });
    await expect(controller.start(input(), new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    expect(controller.getState().review?.transfers).toEqual([]);
  });

  it.each([1, 2])(
    'identifies unavailable model at stage %s without losing config or known review',
    async (stage) => {
      const complete = vi.fn();
      if (stage === 2) complete.mockResolvedValueOnce(JSON.stringify(extraction));
      complete.mockRejectedValueOnce(new OpenRouterChatCompletionError('model_unavailable', 404));
      const controller = createReceiptAnalysisController({ completionClient: { complete } });
      const request = input();
      const before = JSON.stringify(request.configuration);
      await expect(controller.start(request, new AbortController().signal)).rejects.toMatchObject({
        code: 'model_unavailable',
        stage: stage === 1 ? 'extraction' : 'derivation',
      });
      expect(complete).toHaveBeenCalledTimes(stage);
      expect(JSON.stringify(request.configuration)).toBe(before);
      if (stage === 2)
        expect(controller.getState().review).toMatchObject({
          receiptTotalCents: 350,
          buyplace: 'Markt',
        });
    },
  );

  it.each<OpenRouterChatCompletionErrorCode>([
    'auth_error',
    'rate_limited',
    'network_error',
    'timeout',
    'refusal',
    'provider_error',
    'invalid_response',
    'over_limit',
  ])('normalizes %s without provider details or retries', async (code) => {
    const complete = vi.fn().mockRejectedValue(new OpenRouterChatCompletionError(code, 503));
    const controller = createReceiptAnalysisController({ completionClient: { complete } });
    const request = input();
    await expect(controller.start(request, new AbortController().signal)).rejects.toMatchObject({
      code: code === 'over_limit' ? 'output_limit' : code,
      stage: 'extraction',
      reason: null,
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(JSON.stringify(controller.getState())).not.toContain('secret-key');
    expect(request.image.bytes.every((b) => b === 0)).toBe(true);
  });

  it('stops when extraction has no readable items and preserves the bounded reason', async () => {
    const complete = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ ...extraction, status: 'error', errorReason: 'Nicht lesbar.', items: [] }),
      );
    const controller = createReceiptAnalysisController({ completionClient: { complete } });
    await expect(controller.start(input(), new AbortController().signal)).rejects.toMatchObject({
      code: 'model_error',
      stage: 'extraction',
    });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('prevents a late completion from replacing a newer run', async () => {
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const complete = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(JSON.stringify(extraction))
      .mockResolvedValueOnce(JSON.stringify(derivation));
    const controller = createReceiptAnalysisController({ completionClient: { complete } });
    const firstInput = input();
    const first = controller.start(firstInput, new AbortController().signal);
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await controller.start(input(), new AbortController().signal);
    release(JSON.stringify(extraction));
    await rejected;
    expect(firstInput.image.bytes.every((b) => b === 0)).toBe(true);
    expect(controller.getState().phase).toBe('succeeded');
  });

  it.each(['reset', 'dispose', 'caller'] as const)(
    'abandons active requests after %s',
    async (action) => {
      let release: (value: string) => void = () => {};
      const complete = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      );
      const controller = createReceiptAnalysisController({ completionClient: { complete } });
      const outer = new AbortController();
      const request = input();
      const pending = controller.start(request, outer.signal);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      if (action === 'caller') outer.abort();
      else controller[action]();
      release(JSON.stringify(extraction));
      await rejected;
      expect(complete).toHaveBeenCalledOnce();
      expect(request.image.bytes.every((b) => b === 0)).toBe(true);
      expect(controller.getState().derivation).toBeNull();
    },
  );
});
