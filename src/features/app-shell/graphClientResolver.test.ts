// Verifies the shared Graph client resolver keeps one instance and honors localhost test overrides.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@auth';
import type { GraphClient } from '@graph';

const { createGraphClientMock, resolveAppAuthClientMock } = vi.hoisted(() => ({
  createGraphClientMock: vi.fn(),
  resolveAppAuthClientMock: vi.fn(),
}));

vi.mock('@graph', () => ({
  createGraphClient: createGraphClientMock,
}));

vi.mock('./authClientResolver', () => ({
  resolveAppAuthClient: resolveAppAuthClientMock,
}));

const createStubAuthClient = (): AuthClient => ({
  initialize: vi.fn(async () => {}),
  getSession: vi.fn(() => ({
    isAuthenticated: false,
    account: null,
  })),
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  getAccessToken: vi.fn(async () => 'token'),
});

const createStubGraphClient = (): GraphClient => ({
  listChildren: vi.fn(async () => []),
  getFileMetadata: vi.fn(async () => ({
    eTag: '"etag-1"',
    sizeBytes: 1,
    lastModifiedDateTime: '2026-03-09T10:15:00Z',
  })),
  downloadFile: vi.fn(async () => Uint8Array.from([1])),
  uploadFile: vi.fn(async () => ({
    eTag: '"etag-2"',
    sizeBytes: 1,
    lastModifiedDateTime: '2026-03-09T10:15:00Z',
  })),
});

describe('app graph client resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    createGraphClientMock.mockReset();
    resolveAppAuthClientMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns one shared graph client instance for non-localhost environments', async () => {
    const stubAuthClient = createStubAuthClient();
    const stubGraphClient = createStubGraphClient();
    resolveAppAuthClientMock.mockReturnValue(stubAuthClient);
    createGraphClientMock.mockReturnValue(stubGraphClient);

    const { resolveAppGraphClient } = await import('./graphClientResolver');

    const firstClient = resolveAppGraphClient();
    const secondClient = resolveAppGraphClient();

    expect(firstClient).toBe(stubGraphClient);
    expect(secondClient).toBe(stubGraphClient);
    expect(resolveAppAuthClientMock).toHaveBeenCalledTimes(1);
    expect(createGraphClientMock).toHaveBeenCalledTimes(1);
    expect(createGraphClientMock).toHaveBeenCalledWith({
      authClient: stubAuthClient,
    });
  });

  it('uses localhost test override graph client when available', async () => {
    const overrideClient = createStubGraphClient();
    createGraphClientMock.mockReturnValue(createStubGraphClient());

    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      __CONSPECTUS_GRAPH_CLIENT__: overrideClient,
    });

    const { resolveAppGraphClient } = await import('./graphClientResolver');

    expect(resolveAppGraphClient()).toBe(overrideClient);
    expect(createGraphClientMock).not.toHaveBeenCalled();
    expect(resolveAppAuthClientMock).not.toHaveBeenCalled();
  });
});
