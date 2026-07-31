// Sends bounded, non-streaming OpenRouter chat completions through a redacted provider boundary.

export const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_CHAT_COMPLETION_TIMEOUT_MS = 60_000;
export const OPENROUTER_CHAT_COMPLETION_MAX_RESPONSE_CHARACTERS = 128 * 1024;

export type OpenRouterChatCompletionErrorCode =
  | 'auth_error'
  | 'rate_limited'
  | 'network_error'
  | 'timeout'
  | 'refusal'
  | 'provider_error'
  | 'invalid_response'
  | 'over_limit';

export class OpenRouterChatCompletionError extends Error {
  readonly code: OpenRouterChatCompletionErrorCode;
  readonly status: number | null;

  constructor(code: OpenRouterChatCompletionErrorCode, status: number | null = null) {
    super(`OpenRouter chat completion failed (${code}).`);
    this.name = 'OpenRouterChatCompletionError';
    this.code = code;
    this.status = status;
  }
}

export type OpenRouterChatMessageRole = 'system' | 'user' | 'assistant';

export interface OpenRouterChatTextContent {
  readonly type: 'text';
  readonly text: string;
}

export interface OpenRouterChatJpegContent {
  readonly type: 'image/jpeg';
  readonly base64: string;
}

export type OpenRouterChatContent = OpenRouterChatTextContent | OpenRouterChatJpegContent;

export interface OpenRouterChatMessage {
  readonly role: OpenRouterChatMessageRole;
  readonly content: string | readonly OpenRouterChatContent[];
}

export interface OpenRouterChatJsonSchema {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly description?: string;
}

export interface OpenRouterChatCompletionRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly messages: readonly OpenRouterChatMessage[];
  readonly responseFormat?: OpenRouterChatJsonSchema;
}

export interface OpenRouterChatCompletionClient {
  complete(request: OpenRouterChatCompletionRequest, signal?: AbortSignal): Promise<string>;
}

interface CreateOpenRouterChatCompletionClientOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

interface UnknownRecord {
  readonly [key: string]: unknown;
}

const OVER_LIMIT_ERROR_TYPES = new Set([
  'context_length_exceeded',
  'max_tokens_exceeded',
  'token_limit_exceeded',
  'string_too_long',
  'payload_too_large',
  'image_too_large',
]);

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readProviderErrorType = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const metadata = value['metadata'];
  if (!isRecord(metadata)) {
    return null;
  }

  const errorType = metadata['error_type'];
  return typeof errorType === 'string' ? errorType : null;
};

const readProviderErrorStatus = (value: unknown, fallback: number): number => {
  if (!isRecord(value)) {
    return fallback;
  }

  const code = value['code'];
  return typeof code === 'number' && Number.isInteger(code) ? code : fallback;
};

const classifyProviderFailure = (
  status: number,
  providerError: unknown,
): OpenRouterChatCompletionError => {
  const errorType = readProviderErrorType(providerError);

  if (
    errorType === 'refusal' ||
    errorType === 'content_policy_violation' ||
    errorType === 'invalid_image' ||
    errorType === 'image_too_small' ||
    errorType === 'unsupported_image_format'
  ) {
    return new OpenRouterChatCompletionError('refusal', status);
  }
  if (status === 413 || (errorType !== null && OVER_LIMIT_ERROR_TYPES.has(errorType))) {
    return new OpenRouterChatCompletionError('over_limit', status);
  }
  if (
    status === 401 ||
    status === 402 ||
    status === 403 ||
    errorType === 'authentication' ||
    errorType === 'payment_required' ||
    errorType === 'permission_denied'
  ) {
    return new OpenRouterChatCompletionError('auth_error', status);
  }
  if (status === 429 || errorType === 'rate_limit_exceeded') {
    return new OpenRouterChatCompletionError('rate_limited', status);
  }
  if (status === 408 || status === 504 || errorType === 'timeout') {
    return new OpenRouterChatCompletionError('timeout', status);
  }
  return new OpenRouterChatCompletionError('provider_error', status);
};

const createAbortError = (): DOMException =>
  new DOMException('OpenRouter chat completion was cancelled.', 'AbortError');

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw createAbortError();
  }
};

const serializeMessages = (messages: readonly OpenRouterChatMessage[]): readonly UnknownRecord[] =>
  messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) =>
            part.type === 'text'
              ? { type: 'text', text: part.text }
              : {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${part.base64}` },
                },
          ),
  }));

const createRequestBody = (request: OpenRouterChatCompletionRequest): UnknownRecord => {
  const provider = {
    allow_fallbacks: false,
    ...(request.responseFormat === undefined ? {} : { require_parameters: true }),
  };

  return {
    model: request.model,
    messages: serializeMessages(request.messages),
    stream: false,
    provider,
    ...(request.responseFormat === undefined
      ? {}
      : {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.responseFormat.name,
              strict: true,
              schema: request.responseFormat.schema,
              ...(request.responseFormat.description === undefined
                ? {}
                : { description: request.responseFormat.description }),
            },
          },
        }),
  };
};

const parseResponsePayload = (payload: unknown, httpStatus: number): string => {
  if (!isRecord(payload)) {
    throw new OpenRouterChatCompletionError('invalid_response', httpStatus);
  }

  const topLevelError = payload['error'];
  if (topLevelError !== undefined && topLevelError !== null) {
    const status = readProviderErrorStatus(topLevelError, httpStatus);
    throw classifyProviderFailure(status, topLevelError);
  }

  const choices = payload['choices'];
  if (!Array.isArray(choices) || choices.length !== 1) {
    throw new OpenRouterChatCompletionError('invalid_response', httpStatus);
  }

  const choice = choices[0];
  if (!isRecord(choice)) {
    throw new OpenRouterChatCompletionError('invalid_response', httpStatus);
  }

  const choiceError = choice['error'];
  if (choiceError !== undefined && choiceError !== null) {
    const status = readProviderErrorStatus(choiceError, httpStatus);
    throw classifyProviderFailure(status, choiceError);
  }

  const finishReason = choice['finish_reason'];
  if (finishReason !== 'stop') {
    if (finishReason === 'length') {
      throw new OpenRouterChatCompletionError('over_limit', httpStatus);
    }
    if (finishReason === 'content_filter') {
      throw new OpenRouterChatCompletionError('refusal', httpStatus);
    }
    throw new OpenRouterChatCompletionError('invalid_response', httpStatus);
  }

  const message = choice['message'];
  if (!isRecord(message)) {
    throw new OpenRouterChatCompletionError('invalid_response', httpStatus);
  }
  if (message['refusal'] !== undefined && message['refusal'] !== null) {
    throw new OpenRouterChatCompletionError('refusal', httpStatus);
  }

  const content = message['content'];
  if (typeof content !== 'string' || content.trim() === '') {
    throw new OpenRouterChatCompletionError('invalid_response', httpStatus);
  }
  return content;
};

export const createOpenRouterChatCompletionClient = (
  options: CreateOpenRouterChatCompletionClientOptions = {},
): OpenRouterChatCompletionClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? OPENROUTER_CHAT_COMPLETION_TIMEOUT_MS;

  return {
    async complete(request, signal): Promise<string> {
      throwIfAborted(signal);
      const normalizedApiKey = request.apiKey.trim();
      if (!normalizedApiKey) {
        throw new OpenRouterChatCompletionError('auth_error');
      }

      const requestAbortController = new AbortController();
      let didTimeout = false;
      const abortFromCaller = (): void => requestAbortController.abort();
      signal?.addEventListener('abort', abortFromCaller, { once: true });
      if (signal?.aborted === true) {
        requestAbortController.abort();
      }
      const timeoutId = setTimeout(() => {
        didTimeout = true;
        requestAbortController.abort();
      }, timeoutMs);

      try {
        let response: Response;
        try {
          response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${normalizedApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(createRequestBody(request)),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            signal: requestAbortController.signal,
          });
        } catch {
          if (signal?.aborted === true) {
            throw createAbortError();
          }
          throw new OpenRouterChatCompletionError(didTimeout ? 'timeout' : 'network_error');
        }

        let responseText: string;
        try {
          responseText = await response.text();
        } catch {
          if (signal?.aborted === true) {
            throw createAbortError();
          }
          if (didTimeout) {
            throw new OpenRouterChatCompletionError('timeout');
          }
          if (!response.ok) {
            throw classifyProviderFailure(response.status, null);
          }
          throw new OpenRouterChatCompletionError('invalid_response', response.status);
        }
        if (responseText.length > OPENROUTER_CHAT_COMPLETION_MAX_RESPONSE_CHARACTERS) {
          throw new OpenRouterChatCompletionError('over_limit', response.status);
        }

        let payload: unknown;
        try {
          payload = JSON.parse(responseText);
        } catch {
          if (!response.ok) {
            throw classifyProviderFailure(response.status, null);
          }
          throw new OpenRouterChatCompletionError('invalid_response', response.status);
        }

        if (!response.ok) {
          const providerError = isRecord(payload) ? payload['error'] : null;
          throw classifyProviderFailure(response.status, providerError);
        }

        return parseResponsePayload(payload, response.status);
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromCaller);
      }
    },
  };
};

export const openRouterChatCompletionClient = createOpenRouterChatCompletionClient();
