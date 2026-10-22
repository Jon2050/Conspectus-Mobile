// Derives free receipt models and appends the explicitly supported paid model to both roles.
import {
  parseOpenRouterReasoningCapabilities,
  type OpenRouterReasoningCapabilities,
} from './reasoning';
export interface OpenRouterModelOption {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly reasoning?: OpenRouterReasoningCapabilities;
  readonly paid?: boolean;
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

// Explicit addition for both receipt stages, verified with production requests on 2026-10-22.
// Keep the minimum known effort when the live catalog omits this model or its capabilities.
const MANUAL_MODEL = {
  id: 'meta/muse-spark-1.3-contributor',
  name: 'Meta: Muse Spark 1.3 Contributor',
  label: 'Meta: Muse Spark 1.3 Contributor — meta/muse-spark-1.3-contributor',
  paid: true,
  reasoning: { mandatory: true, supportedEfforts: ['minimal'] },
} satisfies OpenRouterModelOption;

// Confirmed gateway 403 "Gate Free Endpoints by Agentic Harness". The current catalog and
// endpoint metadata expose no capability flag for this access gate. Exclude only these variants.
const HARNESS_RESTRICTED_MODELS = new Set([
  'thinkingmachines/inkling:free',
  'thinkingmachines/inkling-small:free',
]);

interface ParsedCatalogModel {
  readonly id: string;
  readonly name: string;
  readonly inputModalities: ReadonlySet<string>;
  readonly outputModalities: ReadonlySet<string>;
  readonly pricing: Record<string, unknown>;
  readonly reasoning?: OpenRouterReasoningCapabilities;
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

  const reasoning = parseOpenRouterReasoningCapabilities(value.reasoning);
  return {
    id,
    name,
    inputModalities: toStringSet(value.architecture.input_modalities),
    outputModalities: toStringSet(value.architecture.output_modalities),
    pricing: value.pricing,
    ...(reasoning ? { reasoning } : {}),
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
  model.id.endsWith(':free') &&
  isZeroPrice(model.pricing.prompt, false) &&
  isZeroPrice(model.pricing.completion, false) &&
  isZeroPrice(model.pricing.request, true);

const isRouterPseudoModel = (model: ParsedCatalogModel): boolean => model.id === 'openrouter/free';

// Receipt requests need JSON text only. Zero text-token prices do not cover other output
// modalities: audio generators can advertise free text while still charging for audio.
const hasTextOnlyOutput = (model: ParsedCatalogModel): boolean =>
  model.outputModalities.size === 1 && model.outputModalities.has('text');

const isVisionModel = (model: ParsedCatalogModel): boolean =>
  !isRouterPseudoModel(model) &&
  hasFreeBasePricing(model) &&
  isZeroPrice(model.pricing.image, true) &&
  model.inputModalities.has('image') &&
  hasTextOnlyOutput(model);

const isTransferModel = (model: ParsedCatalogModel): boolean =>
  !isRouterPseudoModel(model) &&
  hasFreeBasePricing(model) &&
  model.inputModalities.has('text') &&
  hasTextOnlyOutput(model);

const toOption = (model: ParsedCatalogModel): OpenRouterModelOption => ({
  id: model.id,
  name: model.name,
  label: `${model.name} — ${model.id}`,
  ...(model.reasoning ? { reasoning: model.reasoning } : {}),
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
    .filter((model): model is ParsedCatalogModel => model !== null)
    .filter((model) => !HARNESS_RESTRICTED_MODELS.has(model.id));

  const manualModel: OpenRouterModelOption = {
    ...MANUAL_MODEL,
    reasoning:
      parsedModels.find((model) => model.id === MANUAL_MODEL.id)?.reasoning ??
      MANUAL_MODEL.reasoning,
  };

  return {
    visionModels: [
      ...toSortedUniqueOptions(
        parsedModels,
        (model) => model.id !== MANUAL_MODEL.id && isVisionModel(model),
      ),
      manualModel,
    ],
    transferModels: [
      ...toSortedUniqueOptions(
        parsedModels,
        (model) => model.id !== MANUAL_MODEL.id && isTransferModel(model),
      ),
      manualModel,
    ],
  };
};
