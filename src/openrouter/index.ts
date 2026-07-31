// Defines the public OpenRouter provider boundary used by receipt feature orchestration.
export {
  OPENROUTER_USER_MODELS_URL,
  OpenRouterCatalogError,
  createOpenRouterModelCatalogClient,
  openRouterModelCatalogClient,
} from './modelCatalogClient';
export type {
  OpenRouterCatalogErrorCode,
  OpenRouterModelCatalogClient,
} from './modelCatalogClient';
export {
  OpenRouterCatalogResponseError,
  parseOpenRouterCompatibleModelCatalog,
} from './modelCatalog';
export type { OpenRouterCompatibleModelCatalog, OpenRouterModelOption } from './modelCatalog';
