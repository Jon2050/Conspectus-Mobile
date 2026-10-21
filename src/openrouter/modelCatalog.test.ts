// Verifies exact free-price and capability filtering for both OpenRouter receipt model roles.
import { describe, expect, it } from 'vitest';

import {
  OpenRouterCatalogResponseError,
  parseOpenRouterCompatibleModelCatalog as parseWithBenchmarks,
} from './modelCatalog';

const model = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  canonical_slug: `${id}-snapshot`,
  name: `Name ${id}`,
  architecture: {
    input_modalities: ['text'],
    output_modalities: ['text'],
  },
  pricing: {
    prompt: '0',
    completion: '0.000',
  },
  supported_parameters: [],
  ...overrides,
});

const benchmark = (modelId: string, score: unknown = 20) => ({
  source: 'artificial-analysis',
  model_permaslug: `${modelId}-snapshot`,
  intelligence_index: score,
});

const parseOpenRouterCompatibleModelCatalog = (payload: { data: unknown }) =>
  parseWithBenchmarks(payload, {
    data: Array.isArray(payload.data)
      ? [
          ...new Set(
            payload.data
              .filter(
                (entry): entry is Record<string, unknown> =>
                  entry !== null && typeof entry === 'object',
              )
              .map((entry) => String(entry.id)),
          ),
        ].map((id) => benchmark(id))
      : [],
  });

describe('parseOpenRouterCompatibleModelCatalog', () => {
  it('excludes confirmed free harness-only variants while retaining other eligible models and reasoning metadata', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('thinkingmachines/inkling:free'),
        model('thinkingmachines/inkling-small:free'),
        model('provider/text:free', {
          reasoning: { mandatory: true, supported_efforts: ['max', 'low'], default_effort: 'max' },
        }),
      ],
    });
    expect(catalog.transferModels.map((option) => option.id)).toEqual(['provider/text:free']);
    expect(catalog.transferModels[0]?.reasoning).toMatchObject({
      mandatory: true,
      supportedEfforts: ['low', 'max'],
      defaultEffort: 'max',
    });
  });
  it('derives independent role options and permits one eligible model in both roles', () => {
    const sharedModel = model('provider/shared:free', {
      name: 'Shared Free',
      architecture: {
        input_modalities: ['text', 'image'],
        output_modalities: ['text'],
      },
      pricing: {
        prompt: 0,
        completion: '0',
        request: '0.0',
        image: '0',
      },
      supported_parameters: ['structured_outputs'],
    });

    const catalog = parseOpenRouterCompatibleModelCatalog({ data: [sharedModel] });

    expect(catalog.visionModels).toEqual([
      {
        id: 'provider/shared:free',
        name: 'Shared Free',
        label: 'Shared Free — provider/shared:free',
      },
    ]);
    expect(catalog.transferModels).toEqual(catalog.visionModels);
  });

  it('accepts omitted optional request and image surcharge fields in current free entries', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/vision:free', {
          architecture: {
            input_modalities: ['image'],
            output_modalities: ['text'],
          },
        }),
        model('provider/text:free', {
          supported_parameters: ['structured_outputs'],
        }),
      ],
    });

    expect(catalog.visionModels.map(({ id }) => id)).toEqual(['provider/vision:free']);
    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['provider/text:free']);
  });

  it('rejects paid, malformed-price, capability-mismatched, and automatic router entries', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/paid-prompt', {
          pricing: { prompt: '0.01', completion: '0', request: '0', image: '0' },
          architecture: { input_modalities: ['image'], output_modalities: ['text'] },
        }),
        model('provider/paid-completion', {
          pricing: { prompt: '0', completion: '1e-6' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/underflow-price', {
          pricing: { prompt: '1e-999', completion: '0' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/paid-request', {
          pricing: { prompt: '0', completion: '0', request: '0.1' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/paid-image', {
          pricing: { prompt: '0', completion: '0', image: 1 },
          architecture: { input_modalities: ['image'], output_modalities: ['text'] },
        }),
        model('provider/malformed', {
          pricing: { prompt: '', completion: '0' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/no-text-output', {
          architecture: { input_modalities: ['image'], output_modalities: ['image'] },
        }),
        model('openrouter/free', {
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          supported_parameters: ['structured_outputs'],
        }),
      ],
    });

    expect(catalog).toEqual({ visionModels: [], transferModels: [] });
  });

  it('accepts text models without structured-output metadata at the exact intelligence threshold', () => {
    const catalog = parseWithBenchmarks(
      { data: [model('plain')] },
      { data: [benchmark('plain', 20)] },
    );
    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['plain']);
  });

  it('joins only exact canonical snapshots and filters both roles by finite scores of at least 20', () => {
    const vision = (id: string) =>
      model(id, {
        architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
      });
    const models = [
      'threshold',
      'above',
      'below',
      'unknown',
      'wrong-version',
      'string',
      'nonfinite',
      'wrong-source',
      'ambiguous',
    ].map(vision);
    const data = [
      benchmark('threshold', 20),
      benchmark('above', 42.7),
      benchmark('below', 19.99),
      { ...benchmark('wrong-version', 90), model_permaslug: 'wrong-version-other-snapshot' },
      benchmark('string', '99'),
      benchmark('nonfinite', Infinity),
      { ...benchmark('wrong-source', 99), source: 'design-arena' },
      benchmark('ambiguous', 99),
      benchmark('ambiguous', 1),
    ];
    const result = parseWithBenchmarks({ data: models }, { data });
    expect(result.visionModels.map(({ id }) => id).sort()).toEqual(['above', 'threshold']);
    expect(result.transferModels).toEqual(result.visionModels);
    expect(() => parseWithBenchmarks({ data: models }, { data: null })).toThrow(
      OpenRouterCatalogResponseError,
    );
  });

  it('accepts textual zero formats without treating underflowing nonzero decimals as free', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/zero-exponent', {
          pricing: { prompt: '-0.000e+999', completion: '.0', request: '+0e-10' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/tiny-decimal', {
          pricing: {
            prompt: '0.0000000000000000000000000000000000000000000000000000000000000000000001',
            completion: '0',
          },
          supported_parameters: ['structured_outputs'],
        }),
      ],
    });

    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['provider/zero-exponent']);
  });

  it('sorts by readable name and deduplicates exact model IDs', () => {
    const eligible = (id: string, name: string) =>
      model(id, {
        name,
        supported_parameters: ['structured_outputs'],
      });

    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        eligible('provider/z', 'Zulu'),
        eligible('provider/a', 'Alpha'),
        eligible('provider/a', 'Duplicate'),
      ],
    });

    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['provider/a', 'provider/z']);
  });

  it('ignores malformed entries but rejects a malformed catalog envelope', () => {
    expect(
      parseOpenRouterCompatibleModelCatalog({
        data: [null, {}, model('provider/plain', { canonical_slug: '' })],
      }),
    ).toEqual({
      visionModels: [],
      transferModels: [],
    });

    expect(() => parseOpenRouterCompatibleModelCatalog({ data: null })).toThrow(
      OpenRouterCatalogResponseError,
    );
  });
});
