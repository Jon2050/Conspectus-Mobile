// Defines the public OpenRouter provider boundary used by receipt feature orchestration.
export {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OPENROUTER_CHAT_COMPLETION_MAX_RESPONSE_CHARACTERS,
  OPENROUTER_CHAT_COMPLETION_TIMEOUT_MS,
  OpenRouterChatCompletionError,
  createOpenRouterChatCompletionClient,
  openRouterChatCompletionClient,
} from './chatCompletionClient';
export type {
  OpenRouterChatCompletionClient,
  OpenRouterChatCompletionErrorCode,
  OpenRouterChatCompletionRequest,
  OpenRouterChatContent,
  OpenRouterChatJpegContent,
  OpenRouterChatJsonSchema,
  OpenRouterChatMessage,
  OpenRouterChatMessageRole,
  OpenRouterChatTextContent,
} from './chatCompletionClient';
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
