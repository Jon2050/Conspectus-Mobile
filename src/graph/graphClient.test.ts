// Tests the Microsoft Graph client browse/read/upload behavior and error normalization.
import { describe, expect, it, vi } from 'vitest';

import { createGraphClient } from './graphClient';

const DRIVE_ITEM_BINDING = {
  driveId: 'drive-123',
  itemId: 'item-456',
  name: 'conspectus.db',
  parentPath: '/Apps/Conspectus',
} as const;

const createAuthClient = (accessTokenResult: string | Error = 'graph-token') => ({
  initialize: vi.fn(async () => {}),
  getSession: vi.fn(() => ({
    isAuthenticated: true,
    account: {
      homeAccountId: 'home-account-id',
      username: 'user@example.com',
      displayName: 'Test User',
    },
  })),
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  getAccessToken: vi.fn(async () => {
    if (accessTokenResult instanceof Error) {
      throw accessTokenResult;
    }

    return accessTokenResult;
  }),
});

const createJsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const getRequestHeaders = (call: readonly [string, RequestInit | undefined]): Headers =>
  new Headers(call[1]?.headers);

const getFetchCall = (
  fetchFn: ReturnType<typeof vi.fn>,
): readonly [string, RequestInit | undefined] =>
  (fetchFn.mock.calls[0] as [string, RequestInit | undefined]) ?? ['', undefined];

describe('createGraphClient', () => {
  it('lists root drive children with normalized browse item details', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        value: [
          {
            id: 'file-2',
            name: 'zeta.db',
            parentReference: {
              driveId: 'drive-123',
              path: '/drive/root:/Finance',
            },
            file: {},
          },
          {
            id: 'folder-1',
            name: 'Archives',
            parentReference: {
              driveId: 'drive-123',
              path: '/drive/root:',
            },
            folder: {},
          },
          {
            id: 'file-1',
            name: 'alpha.db',
            parentReference: {
              driveId: 'drive-123',
              path: '/drive/root:/Finance',
            },
            file: {},
          },
          {
            id: 'ignored-package',
            name: 'Package',
            parentReference: {
              driveId: 'drive-123',
              path: '/drive/root:',
            },
          },
        ],
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    const items = await client.listChildren();

    expect(items).toEqual([
      {
        driveId: 'drive-123',
        itemId: 'folder-1',
        name: 'Archives',
        parentPath: '/',
        kind: 'folder',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-1',
        name: 'alpha.db',
        parentPath: '/Finance',
        kind: 'file',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-2',
        name: 'zeta.db',
        parentPath: '/Finance',
        kind: 'file',
      },
    ]);

    const [requestUrl] = getFetchCall(fetchFn);
    expect(requestUrl).toBe(
      'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id%2Cname%2CparentReference%2Cfile%2Cfolder',
    );
  });

  it('lists folder children from a selected folder reference', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        value: [
          {
            id: 'file-1',
            name: 'conspectus.db',
            parentReference: {
              driveId: 'drive-123',
              path: '/drive/root:/Finance',
            },
            file: {},
          },
        ],
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await client.listChildren({
      driveId: 'drive-123',
      itemId: 'folder-456',
      path: '/Finance',
    });

    const [requestUrl] = getFetchCall(fetchFn);
    expect(requestUrl).toBe(
      'https://graph.microsoft.com/v1.0/drives/drive-123/items/folder-456/children?$select=id%2Cname%2CparentReference%2Cfile%2Cfolder',
    );
  });

  it('follows paginated children responses until all browse items are loaded', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi
      .fn<(_: string) => Promise<Response>>()
      .mockResolvedValueOnce(
        createJsonResponse({
          value: [
            {
              id: 'folder-1',
              name: 'Finance',
              parentReference: {
                driveId: 'drive-123',
                path: '/drive/root:',
              },
              folder: {},
            },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          value: [
            {
              id: 'file-1',
              name: 'conspectus.db',
              parentReference: {
                driveId: 'drive-123',
                path: '/drive/root:/Finance',
              },
              file: {},
            },
          ],
        }),
      );
    const client = createGraphClient({ authClient, fetchFn });

    const items = await client.listChildren();

    expect(items).toEqual([
      {
        driveId: 'drive-123',
        itemId: 'folder-1',
        name: 'Finance',
        parentPath: '/',
        kind: 'folder',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-1',
        name: 'conspectus.db',
        parentPath: '/Finance',
        kind: 'file',
      },
    ]);
    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id%2Cname%2CparentReference%2Cfile%2Cfolder',
      expect.any(Object),
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=abc',
      expect.any(Object),
    );
  });

  it('fetches file metadata with an auth-backed Graph request', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        eTag: '"etag-1"',
        size: 2048,
        lastModifiedDateTime: '2026-03-09T10:15:00Z',
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    const metadata = await client.getFileMetadata(DRIVE_ITEM_BINDING);

    expect(metadata).toEqual({
      eTag: '"etag-1"',
      sizeBytes: 2048,
      lastModifiedDateTime: '2026-03-09T10:15:00Z',
    });
    expect(authClient.getAccessToken).toHaveBeenCalledWith(['Files.ReadWrite']);

    const [requestUrl, requestInit] = getFetchCall(fetchFn);
    expect(requestUrl).toBeDefined();
    expect(requestInit).toBeDefined();

    const parsedUrl = new URL(requestUrl as string);
    expect(parsedUrl.origin).toBe('https://graph.microsoft.com');
    expect(parsedUrl.pathname).toBe('/v1.0/drives/drive-123/items/item-456');
    expect(parsedUrl.searchParams.get('$select')).toBe('eTag,size,lastModifiedDateTime');

    const requestHeaders = getRequestHeaders(getFetchCall(fetchFn));
    expect(requestHeaders.get('Authorization')).toBe('Bearer graph-token');
  });

  it('downloads file bytes from the Graph content endpoint', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(
      async () =>
        new Response(Uint8Array.from([1, 2, 3, 4]), {
          status: 200,
        }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    const bytes = await client.downloadFile(DRIVE_ITEM_BINDING);

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    const [requestUrl] = getFetchCall(fetchFn);
    expect(requestUrl).toBe(
      'https://graph.microsoft.com/v1.0/drives/drive-123/items/item-456/content',
    );
  });

  it('uploads file bytes with If-Match and returns normalized metadata', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        eTag: '"etag-2"',
        size: 4096,
        lastModifiedDateTime: '2026-03-09T11:00:00Z',
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });
    const bytes = Uint8Array.from([9, 8, 7]);

    const uploadResult = await client.uploadFile(DRIVE_ITEM_BINDING, bytes, '"etag-1"');

    expect(uploadResult).toEqual({
      eTag: '"etag-2"',
      sizeBytes: 4096,
      lastModifiedDateTime: '2026-03-09T11:00:00Z',
    });

    const [requestUrl, requestInit] = getFetchCall(fetchFn);
    expect(requestUrl).toBe(
      'https://graph.microsoft.com/v1.0/drives/drive-123/items/item-456/content',
    );
    expect(requestInit).toMatchObject({
      method: 'PUT',
    });
    expect(requestInit?.body).toBeInstanceOf(Blob);
    await expect((requestInit?.body as Blob).arrayBuffer()).resolves.toEqual(bytes.buffer);

    const requestHeaders = getRequestHeaders(getFetchCall(fetchFn));
    expect(requestHeaders.get('Authorization')).toBe('Bearer graph-token');
    expect(requestHeaders.get('Content-Type')).toBe('application/octet-stream');
    expect(requestHeaders.get('If-Match')).toBe('"etag-1"');
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [412, 'conflict'],
    [429, 'network_error'],
    [503, 'network_error'],
  ] as const)('maps Graph HTTP %s responses to %s', async (status, expectedCode) => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse(
        {
          error: {
            code: `status-${status}`,
            message: `Graph failure ${status}`,
          },
        },
        status,
      ),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: expectedCode,
      status,
    });
  });

  it('maps auth failures to Graph error categories before any network request is made', async () => {
    const authError = Object.assign(new Error('login required'), {
      code: 'interaction_required',
    });
    const authClient = createAuthClient(authError);
    const fetchFn = vi.fn(async () => createJsonResponse({}));
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps auth network failures to network_error before any network request is made', async () => {
    const authError = Object.assign(new Error('network unavailable'), {
      code: 'network_error',
    });
    const authClient = createAuthClient(authError);
    const fetchFn = vi.fn(async () => createJsonResponse({}));
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'network_error',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps fetch rejections to network_error', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('maps JSON body read failures after a successful response to network_error', async () => {
    const authClient = createAuthClient();
    const response = new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const json = vi.fn(async () => {
      throw new TypeError('body stream aborted');
    });
    Object.defineProperty(response, 'json', {
      value: json,
    });
    const fetchFn = vi.fn(async () => response);
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('rejects invalid metadata payloads with an unknown Graph error', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        size: 2048,
        lastModifiedDateTime: '2026-03-09T10:15:00Z',
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'unknown',
      message: 'Microsoft Graph metadata response did not include the required file fields.',
    });
  });

  it('maps arrayBuffer body read failures after a successful response to network_error', async () => {
    const authClient = createAuthClient();
    const response = new Response(null, {
      status: 200,
    });
    const arrayBuffer = vi.fn(async () => {
      throw new TypeError('body stream aborted');
    });
    Object.defineProperty(response, 'arrayBuffer', {
      value: arrayBuffer,
    });
    const fetchFn = vi.fn(async () => response);
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.downloadFile(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('normalizes malformed JSON metadata responses to an unknown Graph error', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(
      async () =>
        new Response('not-json', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.getFileMetadata(DRIVE_ITEM_BINDING)).rejects.toMatchObject({
      code: 'unknown',
      message: 'Microsoft Graph metadata response did not include the required file fields.',
    });
  });

  it('rejects invalid upload payloads with an unknown Graph error', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        eTag: '"etag-2"',
        lastModifiedDateTime: '2026-03-09T11:00:00Z',
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await expect(
      client.uploadFile(DRIVE_ITEM_BINDING, Uint8Array.from([9, 8, 7]), '"etag-1"'),
    ).rejects.toMatchObject({
      code: 'unknown',
      message: 'Microsoft Graph upload response did not include the required file fields.',
    });
  });

  it('rejects invalid children payloads with an unknown Graph error', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        value: [
          {
            id: 'file-1',
            name: 'conspectus.db',
            parentReference: {
              path: '/drive/root:/Finance',
            },
            file: {},
          },
        ],
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.listChildren()).rejects.toMatchObject({
      code: 'unknown',
      message: 'Microsoft Graph children response did not include the required file fields.',
    });
  });

  it('rejects invalid paginated children payloads with an unknown Graph error', async () => {
    const authClient = createAuthClient();
    const fetchFn = vi.fn(async () =>
      createJsonResponse({
        value: [],
        '@odata.nextLink': 123,
      }),
    );
    const client = createGraphClient({ authClient, fetchFn });

    await expect(client.listChildren()).rejects.toMatchObject({
      code: 'unknown',
      message: 'Microsoft Graph children response did not include the required file fields.',
    });
  });
});
