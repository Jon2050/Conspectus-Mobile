// Verifies exact free-price and capability filtering for both OpenRouter receipt model roles.
import { describe, expect, it } from 'vitest';

import {
  OpenRouterCatalogResponseError,
  parseOpenRouterCompatibleModelCatalog,
} from './modelCatalog';
import { resolveOpenRouterReasoning } from './reasoning';

const muse = {
  id: 'meta/muse-spark-1.3-contributor',
  name: 'Meta: Muse Spark 1.3 Contributor',
  label: 'Meta: Muse Spark 1.3 Contributor — meta/muse-spark-1.3-contributor',
  paid: true,
  reasoning: { mandatory: true, supportedEfforts: ['minimal'] },
};

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

describe('parseOpenRouterCompatibleModelCatalog', () => {
  it('appends paid Muse to both roles even when the authenticated catalog is empty', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({ data: [] });
    expect(catalog).toEqual({ visionModels: [muse], transferModels: [muse] });
    expect(resolveOpenRouterReasoning(catalog.visionModels[0]?.reasoning, 'lowest')).toEqual({
      enabled: true,
      effort: 'minimal',
    });
  });

  it('deduplicates the explicit Muse option and prefers declared reasoning capabilities', () => {
    const entry = model(muse.id, {
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
      pricing: { prompt: '0.0000001', completion: '0.0000002' },
      reasoning: { mandatory: true, supported_efforts: ['high', 'low'] },
    });
    const catalog = parseOpenRouterCompatibleModelCatalog({ data: [entry, entry] });
    expect(catalog.visionModels).toHaveLength(1);
    expect(catalog.visionModels[0]).toMatchObject({ id: muse.id, paid: true });
    expect(resolveOpenRouterReasoning(catalog.visionModels[0]?.reasoning, 'lowest')).toEqual({
      enabled: true,
      effort: 'low',
    });
    expect(catalog.transferModels).toEqual(catalog.visionModels);
    // Even a free catalog copy must not duplicate the manually appended vision option.
    expect(
      parseOpenRouterCompatibleModelCatalog({
        data: [{ ...entry, pricing: { prompt: '0', completion: '0' } }],
      }).visionModels,
    ).toHaveLength(1);
  });

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
    expect(catalog.transferModels.map((option) => option.id)).toEqual([
      'provider/text:free',
      muse.id,
    ]);
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
      muse,
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

    expect(catalog.visionModels.map(({ id }) => id)).toEqual(['provider/vision:free', muse.id]);
    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['provider/text:free', muse.id]);
  });

  it('rejects paid, malformed-price, capability-mismatched, and automatic router entries', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/paid-prompt:free', {
          pricing: { prompt: '0.01', completion: '0', request: '0', image: '0' },
          architecture: { input_modalities: ['image'], output_modalities: ['text'] },
        }),
        model('provider/paid-completion:free', {
          pricing: { prompt: '0', completion: '1e-6' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/underflow-price:free', {
          pricing: { prompt: '1e-999', completion: '0' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/paid-request:free', {
          pricing: { prompt: '0', completion: '0', request: '0.1' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/paid-image:free', {
          pricing: { prompt: '0', completion: '0', image: 1 },
          architecture: { input_modalities: ['image'], output_modalities: ['text'] },
        }),
        model('provider/malformed:free', {
          pricing: { prompt: '', completion: '0' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/no-text-output:free', {
          architecture: { input_modalities: ['image'], output_modalities: ['image'] },
        }),
        model('openrouter/free', {
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          supported_parameters: ['structured_outputs'],
        }),
      ],
    });

    expect(catalog).toEqual({ visionModels: [muse], transferModels: [muse] });
  });

  it('accepts both roles without canonical versions, benchmarks or structured-output metadata', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('plain:free', {
          canonical_slug: undefined,
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          benchmarks: { artificial_analysis: { intelligence_index: 1 } },
        }),
      ],
    });
    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['plain:free', muse.id]);
    expect(catalog.visionModels).toEqual(catalog.transferModels);
  });

  it('requires an explicit free catalog variant even when text-only token prices are zero', () => {
    const architecture = { input_modalities: ['text', 'image'], output_modalities: ['text'] };
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/unmarked', { architecture }),
        model('provider/free-in-name', { architecture }),
        model('provider/model:free:online', { architecture }),
        model('provider/declared:free', { architecture }),
      ],
    });
    expect(catalog.transferModels.map(({ id }) => id)).toEqual(['provider/declared:free', muse.id]);
    expect(catalog.visionModels).toEqual(catalog.transferModels);
  });

  it('rejects additional output modalities even when all declared prices are zero', () => {
    const entries = ['audio', 'image', 'video', 'unknown'].map((modality) =>
      model(`provider/${modality}:free`, {
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['text', modality],
        },
      }),
    );
    expect(parseOpenRouterCompatibleModelCatalog({ data: entries })).toEqual({
      visionModels: [muse],
      transferModels: [muse],
    });
  });

  it('normalizes text-only output while allowing unused input capabilities', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/multimodal-input:free', {
          architecture: {
            input_modalities: ['text', 'image', 'audio'],
            output_modalities: [' TEXT ', 'text'],
          },
        }),
      ],
    });
    expect(catalog.transferModels.map(({ id }) => id)).toEqual([
      'provider/multimodal-input:free',
      muse.id,
    ]);
    expect(catalog.visionModels).toEqual(catalog.transferModels);
  });

  it('accepts textual zero formats without treating underflowing nonzero decimals as free', () => {
    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        model('provider/zero-exponent:free', {
          pricing: { prompt: '-0.000e+999', completion: '.0', request: '+0e-10' },
          supported_parameters: ['structured_outputs'],
        }),
        model('provider/tiny-decimal:free', {
          pricing: {
            prompt: '0.0000000000000000000000000000000000000000000000000000000000000000000001',
            completion: '0',
          },
          supported_parameters: ['structured_outputs'],
        }),
      ],
    });

    expect(catalog.transferModels.map(({ id }) => id)).toEqual([
      'provider/zero-exponent:free',
      muse.id,
    ]);
  });

  it('sorts by readable name and deduplicates exact model IDs', () => {
    const eligible = (id: string, name: string) =>
      model(id, {
        name,
        supported_parameters: ['structured_outputs'],
      });

    const catalog = parseOpenRouterCompatibleModelCatalog({
      data: [
        eligible('provider/z:free', 'Zulu'),
        eligible('provider/a:free', 'Alpha'),
        eligible('provider/a:free', 'Duplicate'),
      ],
    });

    expect(catalog.transferModels.map(({ id }) => id)).toEqual([
      'provider/a:free',
      'provider/z:free',
      muse.id,
    ]);
  });

  it('ignores malformed entries but rejects a malformed catalog envelope', () => {
    expect(
      parseOpenRouterCompatibleModelCatalog({
        data: [null, {}, model('provider/plain', { name: '' })],
      }),
    ).toEqual({
      visionModels: [muse],
      transferModels: [muse],
    });

    expect(() => parseOpenRouterCompatibleModelCatalog({ data: null })).toThrow(
      OpenRouterCatalogResponseError,
    );
  });
});
