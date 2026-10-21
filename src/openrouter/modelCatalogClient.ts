import { withRequestDeadline } from '@shared';
// Fetches OpenRouter's account-filtered catalog and intelligence benchmarks without exposing keys.
import {
  OpenRouterCatalogResponseError,
  parseOpenRouterCompatibleModelCatalog,
  type OpenRouterCompatibleModelCatalog,
} from './modelCatalog';

export const OPENROUTER_USER_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';
export const OPENROUTER_INTELLIGENCE_BENCHMARKS_URL =
  'https://openrouter.ai/api/v1/benchmarks?source=artificial-analysis&task_type=intelligence';

export type OpenRouterCatalogErrorCode =
  | 'invalid_key'
  | 'network_error'
  | 'provider_error'
  | 'invalid_response'
  | 'aborted'
  | 'timeout';

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
  readonly timeoutMs?: number;
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

      try {
        return await withRequestDeadline(
          async (requestSignal) => {
            const pending = new AbortController();
            const abortPending = () => pending.abort(requestSignal.reason);
            requestSignal.addEventListener('abort', abortPending, { once: true });
            if (requestSignal.aborted) abortPending();
            const loadJson = async (url: string): Promise<unknown> => {
              let response: Response;
              try {
                response = await fetchImpl(url, {
                  method: 'GET',
                  headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${normalizedApiKey}`,
                  },
                  cache: 'no-store',
                  credentials: 'omit',
                  redirect: 'error',
                  signal: pending.signal,
                });
              } catch (error) {
                throw new OpenRouterCatalogError(
                  isAbortError(error, pending.signal) ? 'aborted' : 'network_error',
                );
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
              return payload;
            };

            try {
              const [payload, benchmarks] = await Promise.all([
                loadJson(OPENROUTER_USER_MODELS_URL),
                loadJson(OPENROUTER_INTELLIGENCE_BENCHMARKS_URL),
              ]);

              try {
                return parseOpenRouterCompatibleModelCatalog(payload, benchmarks);
              } catch (error) {
                if (error instanceof OpenRouterCatalogResponseError) {
                  throw new OpenRouterCatalogError('invalid_response', 200);
                }
                throw error;
              }
            } finally {
              requestSignal.removeEventListener('abort', abortPending);
              pending.abort();
            }
          },
          options.timeoutMs ?? 30_000,
          signal,
        );
      } catch (error) {
        if (signal?.aborted) throw new OpenRouterCatalogError('aborted');
        if (error instanceof DOMException && error.name === 'TimeoutError')
          throw new OpenRouterCatalogError('timeout');
        throw error;
      }
    },
  };
};

export const openRouterModelCatalogClient = createOpenRouterModelCatalogClient();
