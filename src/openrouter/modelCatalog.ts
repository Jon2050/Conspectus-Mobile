// Parses OpenRouter model metadata and derives the free models eligible for each receipt AI role.
export interface OpenRouterModelOption {
  readonly id: string;
  readonly name: string;
  readonly label: string;
}

export interface OpenRouterCompatibleModelCatalog {
  readonly visionModels: readonly OpenRouterModelOption[];
  readonly transferModels: readonly OpenRouterModelOption[];
}

export class OpenRouterCatalogResponseError extends Error {
  constructor() {
    super('OpenRouter returned an invalid model catalog.');
    this.name = 'OpenRouterCatalogResponseError';
  }
}

interface ParsedCatalogModel {
  readonly id: string;
  readonly name: string;
  readonly inputModalities: ReadonlySet<string>;
  readonly outputModalities: ReadonlySet<string>;
  readonly supportedParameters: ReadonlySet<string>;
  readonly pricing: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toStringSet = (value: unknown): ReadonlySet<string> => {
  if (!Array.isArray(value)) {
    return new Set();
  }

  return new Set(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
};

const parseCatalogModel = (value: unknown): ParsedCatalogModel | null => {
  if (!isRecord(value) || !isRecord(value.architecture) || !isRecord(value.pricing)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    inputModalities: toStringSet(value.architecture.input_modalities),
    outputModalities: toStringSet(value.architecture.output_modalities),
    supportedParameters: toStringSet(value.supported_parameters),
    pricing: value.pricing,
  };
};

const isZeroPrice = (value: unknown, optional: boolean): boolean => {
  if ((value === undefined || value === null) && optional) {
    return true;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return false;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value === 0;
  }

  const normalizedValue = value.trim();
  return /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:e[+-]?\d+)?$/i.test(normalizedValue);
};

const hasFreeBasePricing = (model: ParsedCatalogModel): boolean =>
  isZeroPrice(model.pricing.prompt, false) &&
  isZeroPrice(model.pricing.completion, false) &&
  isZeroPrice(model.pricing.request, true);

const isRouterPseudoModel = (model: ParsedCatalogModel): boolean => model.id === 'openrouter/free';

const isVisionModel = (model: ParsedCatalogModel): boolean =>
  !isRouterPseudoModel(model) &&
  hasFreeBasePricing(model) &&
  isZeroPrice(model.pricing.image, true) &&
  model.inputModalities.has('image') &&
  model.outputModalities.has('text');

const isTransferModel = (model: ParsedCatalogModel): boolean =>
  !isRouterPseudoModel(model) &&
  hasFreeBasePricing(model) &&
  model.inputModalities.has('text') &&
  model.outputModalities.has('text') &&
  model.supportedParameters.has('structured_outputs');

const toOption = (model: ParsedCatalogModel): OpenRouterModelOption => ({
  id: model.id,
  name: model.name,
  label: `${model.name} — ${model.id}`,
});

const toSortedUniqueOptions = (
  models: readonly ParsedCatalogModel[],
  predicate: (model: ParsedCatalogModel) => boolean,
): readonly OpenRouterModelOption[] => {
  const optionsById = new Map<string, OpenRouterModelOption>();

  for (const model of models) {
    if (predicate(model) && !optionsById.has(model.id)) {
      optionsById.set(model.id, toOption(model));
    }
  }

  return [...optionsById.values()].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
    return nameComparison === 0 ? left.id.localeCompare(right.id) : nameComparison;
  });
};

export const parseOpenRouterCompatibleModelCatalog = (
  value: unknown,
): OpenRouterCompatibleModelCatalog => {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new OpenRouterCatalogResponseError();
  }

  const parsedModels = value.data
    .map(parseCatalogModel)
    .filter((model): model is ParsedCatalogModel => model !== null);

  return {
    visionModels: toSortedUniqueOptions(parsedModels, isVisionModel),
    transferModels: toSortedUniqueOptions(parsedModels, isTransferModel),
  };
};
