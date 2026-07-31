// Fetches the account-filtered OpenRouter model catalog without exposing key or provider details.
import {
  OpenRouterCatalogResponseError,
  parseOpenRouterCompatibleModelCatalog,
  type OpenRouterCompatibleModelCatalog,
} from './modelCatalog';

export const OPENROUTER_USER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';

export type OpenRouterCatalogErrorCode =
  | 'invalid_key'
  | 'network_error'
  | 'provider_error'
  | 'invalid_response'
  | 'aborted';

export class OpenRouterCatalogError extends Error {
  readonly code: OpenRouterCatalogErrorCode;
  readonly status: number | null;

  constructor(code: OpenRouterCatalogErrorCode, status: number | null = null) {
    super(`OpenRouter catalog request failed (${code}).`);
    this.name = 'OpenRouterCatalogError';
    this.code = code;
    this.status = status;
  }
}

export interface OpenRouterModelCatalogClient {
  load(apiKey: string, signal?: AbortSignal): Promise<OpenRouterCompatibleModelCatalog>;
}

interface CreateOpenRouterModelCatalogClientOptions {
  readonly fetch?: typeof fetch;
}

const isAbortError = (error: unknown, signal: AbortSignal | undefined): boolean =>
  signal?.aborted === true ||
  (typeof DOMException === 'function' &&
    error instanceof DOMException &&
    error.name === 'AbortError');

export const createOpenRouterModelCatalogClient = (
  options: CreateOpenRouterModelCatalogClientOptions = {},
): OpenRouterModelCatalogClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async load(apiKey, signal): Promise<OpenRouterCompatibleModelCatalog> {
      const normalizedApiKey = apiKey.trim();
      if (!normalizedApiKey) {
        throw new OpenRouterCatalogError('invalid_key');
      }

      let response: Response;
      try {
        response = await fetchImpl(OPENROUTER_USER_MODELS_URL, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${normalizedApiKey}`,
          },
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          ...(signal === undefined ? {} : { signal }),
        });
      } catch (error) {
        throw new OpenRouterCatalogError(isAbortError(error, signal) ? 'aborted' : 'network_error');
      }

      if (response.status === 401 || response.status === 403) {
        throw new OpenRouterCatalogError('invalid_key', response.status);
      }

      if (!response.ok) {
        throw new OpenRouterCatalogError('provider_error', response.status);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OpenRouterCatalogError('invalid_response', response.status);
      }

      try {
        return parseOpenRouterCompatibleModelCatalog(payload);
      } catch (error) {
        if (error instanceof OpenRouterCatalogResponseError) {
          throw new OpenRouterCatalogError('invalid_response', response.status);
        }
        throw error;
      }
    },
  };
};

export const openRouterModelCatalogClient = createOpenRouterModelCatalogClient();
