// Verifies exact free-price and capability filtering for both OpenRouter receipt model roles.
import { describe, expect, it } from 'vitest';

import {
  OpenRouterCatalogResponseError,
  parseOpenRouterCompatibleModelCatalog,
} from './modelCatalog';

const model = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
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
        model('provider/no-structured-output'),
        model('openrouter/free', {
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          supported_parameters: ['structured_outputs'],
        }),
      ],
    });

    expect(catalog).toEqual({ visionModels: [], transferModels: [] });
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
      parseOpenRouterCompatibleModelCatalog({ data: [null, {}, model('provider/plain')] }),
    ).toEqual({
      visionModels: [],
      transferModels: [],
    });

    expect(() => parseOpenRouterCompatibleModelCatalog({ data: null })).toThrow(
      OpenRouterCatalogResponseError,
    );
  });
});
