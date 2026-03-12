// Implements the typed Microsoft Graph client used for OneDrive browse, read, and upload flows.
import { GRAPH_ONEDRIVE_FILE_SCOPES, type AuthClient } from '@auth';

import type {
  DriveItemBinding,
  DriveFolderReference,
  GraphClient,
  GraphDriveItem,
  GraphErrorCode,
  GraphFileMetadata,
  GraphUploadResult,
} from './index';

const GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';
const CHILDREN_FIELDS = 'id,name,parentReference,file,folder';
const METADATA_FIELDS = 'eTag,size,lastModifiedDateTime';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

interface GraphParentReferencePayload {
  readonly driveId?: unknown;
  readonly path?: unknown;
}

interface GraphItemPayload {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly parentReference?: unknown;
  readonly file?: unknown;
  readonly folder?: unknown;
  readonly eTag?: unknown;
  readonly size?: unknown;
  readonly lastModifiedDateTime?: unknown;
}

interface GraphChildrenPayload {
  readonly value?: unknown;
  readonly '@odata.nextLink'?: unknown;
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
  readonly createXhrFn?: () => XMLHttpRequest;
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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isGraphItemPayload = (value: unknown): value is GraphItemPayload => isObject(value);

const isGraphChildrenPayload = (value: unknown): value is GraphChildrenPayload => isObject(value);

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

const getErrorMessage = (error: unknown): string | null => {
  if (!isObject(error) || typeof error.message !== 'string') {
    return null;
  }

  const message = error.message.trim();
  return message.length > 0 ? message : null;
};

const buildDriveItemUrl = (binding: DriveItemBinding, suffix = ''): string => {
  const driveId = encodeURIComponent(binding.driveId);
  const itemId = encodeURIComponent(binding.itemId);
  return `${GRAPH_API_BASE_URL}/drives/${driveId}/items/${itemId}${suffix}`;
};

const buildFolderChildrenUrl = (folder?: DriveFolderReference): string => {
  if (folder === undefined) {
    return `${GRAPH_API_BASE_URL}/me/drive/root/children`;
  }

  const driveId = encodeURIComponent(folder.driveId);
  const itemId = encodeURIComponent(folder.itemId);
  return `${GRAPH_API_BASE_URL}/drives/${driveId}/items/${itemId}/children`;
};

const normalizeParentPath = (value: string): string => {
  const trimmedValue = value.trim();
  const delimiterIndex = trimmedValue.indexOf(':');
  const graphPath = delimiterIndex >= 0 ? trimmedValue.slice(delimiterIndex + 1) : trimmedValue;
  let decodedPath = graphPath;

  try {
    decodedPath = decodeURIComponent(graphPath);
  } catch (error) {
    if (!(error instanceof URIError)) {
      throw error;
    }
  }

  const normalizedPath = decodedPath.length > 0 ? decodedPath : '/';
  const withLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/g, '');
  return withoutTrailingSlash.length > 0 ? withoutTrailingSlash : '/';
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

  return new GraphClientError(
    'unknown',
    getErrorMessage(error) ?? getDefaultErrorMessage('unknown'),
    undefined,
    error,
  );
};

const normalizeNetworkError = (error: unknown): GraphClientError =>
  new GraphClientError('network_error', getDefaultErrorMessage('network_error'), undefined, error);

const isSyntaxError = (error: unknown): boolean =>
  error instanceof SyntaxError ||
  (isObject(error) && (error as { name?: unknown }).name === 'SyntaxError');

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

const normalizeXhrError = (xhr: XMLHttpRequest): GraphClientError => {
  let payload: unknown = null;

  try {
    if (xhr.responseText.trim().length > 0) {
      payload = JSON.parse(xhr.responseText);
    }
  } catch {
    payload = null;
  }

  const code = mapStatusToErrorCode(xhr.status);
  const message =
    code === 'unknown'
      ? (getGraphErrorMessage(payload) ?? getDefaultErrorMessage(code))
      : getDefaultErrorMessage(code);

  return new GraphClientError(code, message, xhr.status, payload);
};

const readJsonPayload = async (
  response: Response,
  invalidResponseMessage: string,
): Promise<unknown> => {
  try {
    return await response.json();
  } catch (error) {
    if (isSyntaxError(error)) {
      throw new GraphClientError('unknown', invalidResponseMessage, response.status, error);
    }

    throw normalizeNetworkError(error);
  }
};

const normalizeDriveItem = (
  payload: unknown,
  invalidResponseMessage: string,
): GraphDriveItem | null => {
  if (!isGraphItemPayload(payload)) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  if (
    typeof payload.id !== 'string' ||
    typeof payload.name !== 'string' ||
    !isObject(payload.parentReference) ||
    typeof (payload.parentReference as GraphParentReferencePayload).driveId !== 'string' ||
    typeof (payload.parentReference as GraphParentReferencePayload).path !== 'string'
  ) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  const kind = isObject(payload.folder) ? 'folder' : isObject(payload.file) ? 'file' : null;

  if (kind === null) {
    return null;
  }

  return {
    driveId: (payload.parentReference as GraphParentReferencePayload).driveId as string,
    itemId: payload.id,
    name: payload.name,
    parentPath: normalizeParentPath(
      (payload.parentReference as GraphParentReferencePayload).path as string,
    ),
    kind,
  };
};

const normalizeGraphItem = (
  payload: unknown,
  invalidResponseMessage: string,
): GraphFileMetadata | GraphUploadResult => {
  if (!isGraphItemPayload(payload)) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  if (
    !isNonEmptyString(payload.eTag) ||
    typeof payload.size !== 'number' ||
    !Number.isFinite(payload.size) ||
    payload.size < 0 ||
    !isNonEmptyString(payload.lastModifiedDateTime)
  ) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  return {
    eTag: payload.eTag,
    sizeBytes: payload.size,
    lastModifiedDateTime: payload.lastModifiedDateTime,
  };
};

const normalizeChildrenPayload = (
  payload: unknown,
  invalidResponseMessage: string,
): {
  readonly items: readonly GraphDriveItem[];
  readonly nextLink: string | null;
} => {
  if (!isGraphChildrenPayload(payload) || !Array.isArray(payload.value)) {
    throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
  }

  const nextLink =
    payload['@odata.nextLink'] === undefined
      ? null
      : typeof payload['@odata.nextLink'] === 'string'
        ? payload['@odata.nextLink']
        : (() => {
            throw new GraphClientError('unknown', invalidResponseMessage, undefined, payload);
          })();

  return {
    items: payload.value
      .map((childPayload) => normalizeDriveItem(childPayload, invalidResponseMessage))
      .filter((child): child is GraphDriveItem => child !== null),
    nextLink,
  };
};

export const createGraphClient = (options: CreateGraphClientOptions): GraphClient => {
  const fetchFn = options.fetchFn ?? fetch;
  const createXhrFn = options.createXhrFn ?? (() => new XMLHttpRequest());
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
    async listChildren(folder): Promise<readonly GraphDriveItem[]> {
      const invalidChildrenResponseMessage =
        'Microsoft Graph children response did not include the required file fields.';
      const items: GraphDriveItem[] = [];
      let nextUrl: string | null =
        `${buildFolderChildrenUrl(folder)}?$select=${encodeURIComponent(CHILDREN_FIELDS)}`;

      while (nextUrl !== null) {
        const response = await executeRequest(nextUrl);
        const payload = await readJsonPayload(response, invalidChildrenResponseMessage);
        const page = normalizeChildrenPayload(payload, invalidChildrenResponseMessage);
        items.push(...page.items);
        nextUrl = page.nextLink;
      }

      return items.sort((left, right) => {
        if (left.kind !== right.kind) {
          return left.kind === 'folder' ? -1 : 1;
        }

        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      });
    },

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

    async downloadFile(
      binding,
      onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    ): Promise<Uint8Array> {
      const response = await executeRequest(buildDriveItemUrl(binding, '/content'));
      try {
        const contentLength = response.headers.get('Content-Length');
        const totalBytes = contentLength !== null ? parseInt(contentLength, 10) : null;

        if (onProgress && response.body !== null) {
          const reader = response.body.getReader();
          let loadedBytes = 0;
          const chunks: Uint8Array[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              chunks.push(value);
              loadedBytes += value.length;
              onProgress(loadedBytes, totalBytes);
            }
          }

          const arrayBuffer = new Uint8Array(loadedBytes);
          let offset = 0;
          for (const chunk of chunks) {
            arrayBuffer.set(chunk, offset);
            offset += chunk.length;
          }
          return arrayBuffer;
        }

        const arrayBuffer = await response.arrayBuffer();
        if (onProgress) {
          onProgress(arrayBuffer.byteLength, totalBytes);
        }
        return new Uint8Array(arrayBuffer);
      } catch (error) {
        throw normalizeNetworkError(error);
      }
    },

    async uploadFile(
      binding,
      bytes,
      expectedETag,
      onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
    ): Promise<GraphUploadResult> {
      const url = buildDriveItemUrl(binding, '/content');

      if (onProgress) {
        let accessToken: string;
        try {
          accessToken = await options.authClient.getAccessToken(GRAPH_ONEDRIVE_FILE_SCOPES);
        } catch (error) {
          throw normalizeAuthError(error);
        }

        return new Promise((resolve, reject) => {
          const xhr = createXhrFn();
          xhr.open('PUT', url, true);
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.setRequestHeader('If-Match', expectedETag);
          xhr.timeout = 30000;

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              onProgress(event.loaded, event.total);
            } else {
              onProgress(event.loaded, null);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              let payload: unknown = null;
              try {
                if (xhr.responseText.trim().length > 0) {
                  payload = JSON.parse(xhr.responseText);
                }
              } catch {
                // ignore
              }
              try {
                resolve(
                  normalizeGraphItem(
                    payload,
                    'Microsoft Graph upload response did not include the required file fields.',
                  ) as GraphUploadResult,
                );
              } catch (error) {
                reject(
                  new GraphClientError(
                    'unknown',
                    'Microsoft Graph upload response did not include the required file fields.',
                    xhr.status,
                    error,
                  ),
                );
              }
            } else {
              reject(normalizeXhrError(xhr));
            }
          };

          xhr.onerror = () => {
            reject(
              new GraphClientError(
                'network_error',
                getDefaultErrorMessage('network_error'),
                undefined,
                null,
              ),
            );
          };

          xhr.ontimeout = () => {
            reject(
              new GraphClientError(
                'network_error',
                getDefaultErrorMessage('network_error'),
                undefined,
                null,
              ),
            );
          };

          xhr.send(toRequestBody(bytes));
        });
      }

      const response = await executeRequest(url, {
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
      ) as GraphUploadResult;
    },
  };
};
