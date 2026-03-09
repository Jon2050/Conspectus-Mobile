import { GRAPH_ONEDRIVE_FILE_SCOPES, type AuthClient } from '@auth';

import type {
  DriveItemBinding,
  GraphClient,
  GraphErrorCode,
  GraphFileMetadata,
  GraphUploadResult,
} from './index';

const GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';
const METADATA_FIELDS = 'eTag,size,lastModifiedDateTime';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface GraphItemPayload {
  readonly eTag?: unknown;
  readonly size?: unknown;
  readonly lastModifiedDateTime?: unknown;
}

interface GraphErrorPayload {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
  };
}

interface CreateGraphClientOptions {
  readonly authClient: AuthClient;
  readonly fetchFn?: FetchFn;
}

class GraphClientError extends Error {
  readonly code: GraphErrorCode;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(code: GraphErrorCode, message: string, status?: number, cause?: unknown) {
    super(message);
    this.name = 'GraphClientError';
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isGraphItemPayload = (value: unknown): value is GraphItemPayload => isObject(value);

const isGraphErrorPayload = (value: unknown): value is GraphErrorPayload => isObject(value);

const getGraphErrorMessage = (payload: unknown): string | null => {
  if (!isGraphErrorPayload(payload) || !isObject(payload.error)) {
    return null;
  }

  return typeof payload.error.message === 'string' ? payload.error.message : null;
};

const getErrorCode = (error: unknown): string | null => {
  if (!isObject(error) || typeof error.code !== 'string') {
    return null;
  }

  return error.code;
};

const buildDriveItemUrl = (binding: DriveItemBinding, suffix = ''): string => {
  const driveId = encodeURIComponent(binding.driveId);
  const itemId = encodeURIComponent(binding.itemId);
  return `${GRAPH_API_BASE_URL}/drives/${driveId}/items/${itemId}${suffix}`;
};

const createAuthorizedHeaders = (accessToken: string, headers?: HeadersInit): Headers => {
  const authorizedHeaders = new Headers(headers);
  authorizedHeaders.set('Authorization', `Bearer ${accessToken}`);
  return authorizedHeaders;
};

const mapStatusToErrorCode = (status: number): GraphErrorCode => {
  if (status === 401) {
    return 'unauthorized';
  }

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 404) {
    return 'not_found';
  }

  if (status === 409 || status === 412) {
    return 'conflict';
  }

  if (status === 408 || status === 429 || status >= 500) {
    return 'network_error';
  }

  return 'unknown';
};

const getDefaultErrorMessage = (code: GraphErrorCode): string => {
  switch (code) {
    case 'unauthorized':
      return 'Authentication is required to access the selected OneDrive file.';
    case 'forbidden':
      return 'The app does not have permission to access the selected OneDrive file.';
    case 'not_found':
      return 'The selected OneDrive file could not be found.';
    case 'conflict':
      return 'The selected OneDrive file changed on OneDrive. Refresh and try again.';
    case 'network_error':
      return 'The request to OneDrive failed because of a temporary network or service problem. Try again.';
    case 'unknown':
      return 'Microsoft Graph request failed.';
  }
};

const normalizeAuthError = (error: unknown): GraphClientError => {
  const code = getErrorCode(error);

  if (
    code === 'interaction_required' ||
    code === 'no_active_account' ||
    code === 'not_initialized'
  ) {
    return new GraphClientError(
      'unauthorized',
      getDefaultErrorMessage('unauthorized'),
      undefined,
      error,
    );
  }

  if (code === 'network_error') {
    return new GraphClientError(
      'network_error',
      getDefaultErrorMessage('network_error'),
      undefined,
      error,
    );
  }

  return new GraphClientError('unknown', getDefaultErrorMessage('unknown'), undefined, error);
};

const normalizeNetworkError = (error: unknown): GraphClientError =>
  new GraphClientError('network_error', getDefaultErrorMessage('network_error'), undefined, error);

const normalizeHttpError = async (response: Response): Promise<GraphClientError> => {
  let payload: unknown = null;

  try {
    const bodyText = await response.text();
    if (bodyText.trim().length > 0) {
      payload = JSON.parse(bodyText);
    }
  } catch {
    payload = null;
  }

  const code = mapStatusToErrorCode(response.status);
  const message =
    code === 'unknown'
      ? (getGraphErrorMessage(payload) ?? getDefaultErrorMessage(code))
      : getDefaultErrorMessage(code);

  return new GraphClientError(code, message, response.status, payload);
};

const readJsonPayload = async (
  response: Response,
  invalidResponseMessage: string,
): Promise<unknown> => {
  try {
    return await response.json();
  } catch (error) {
    throw new GraphClientError('unknown', invalidResponseMessage, response.status, error);
  }
};

const normalizeGraphItem = (
  payload: unknown,
  invalidResponseMessage: string,
): GraphFileMetadata | GraphUploadResult => {
  if (!isGraphItemPayload(payload)) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  if (
    typeof payload.eTag !== 'string' ||
    typeof payload.size !== 'number' ||
    !Number.isFinite(payload.size) ||
    typeof payload.lastModifiedDateTime !== 'string'
  ) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  return {
    eTag: payload.eTag,
    sizeBytes: payload.size,
    lastModifiedDateTime: payload.lastModifiedDateTime,
  };
};

export const createGraphClient = (options: CreateGraphClientOptions): GraphClient => {
  const fetchFn = options.fetchFn ?? fetch;
  const toRequestBody = (bytes: Uint8Array): Blob =>
    new Blob([Uint8Array.from(bytes).buffer], { type: 'application/octet-stream' });

  const executeRequest = async (url: string, init?: RequestInit): Promise<Response> => {
    let accessToken: string;

    try {
      accessToken = await options.authClient.getAccessToken(GRAPH_ONEDRIVE_FILE_SCOPES);
    } catch (error) {
      throw normalizeAuthError(error);
    }

    const requestInit: RequestInit = {
      ...init,
      headers: createAuthorizedHeaders(accessToken, init?.headers),
    };

    let response: Response;

    try {
      response = await fetchFn(url, requestInit);
    } catch (error) {
      throw normalizeNetworkError(error);
    }

    if (!response.ok) {
      throw await normalizeHttpError(response);
    }

    return response;
  };

  return {
    async getFileMetadata(binding): Promise<GraphFileMetadata> {
      const metadataUrl = `${buildDriveItemUrl(binding)}?$select=${encodeURIComponent(METADATA_FIELDS)}`;
      const response = await executeRequest(metadataUrl);
      const payload = await readJsonPayload(
        response,
        'Microsoft Graph metadata response did not include the required file fields.',
      );

      return normalizeGraphItem(
        payload,
        'Microsoft Graph metadata response did not include the required file fields.',
      );
    },

    async downloadFile(binding): Promise<Uint8Array> {
      const response = await executeRequest(buildDriveItemUrl(binding, '/content'));
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    },

    async uploadFile(binding, bytes, expectedETag): Promise<GraphUploadResult> {
      const response = await executeRequest(buildDriveItemUrl(binding, '/content'), {
        method: 'PUT',
        body: toRequestBody(bytes),
        headers: {
          'Content-Type': 'application/octet-stream',
          'If-Match': expectedETag,
        },
      });
      const payload = await readJsonPayload(
        response,
        'Microsoft Graph upload response did not include the required file fields.',
      );

      return normalizeGraphItem(
        payload,
        'Microsoft Graph upload response did not include the required file fields.',
      );
    },
  };
};
