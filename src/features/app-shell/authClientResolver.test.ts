import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, AuthSession } from '@auth';

const { createAuthClientMock } = vi.hoisted(() => ({
  createAuthClientMock: vi.fn(),
}));

vi.mock('@auth', () => ({
  createAuthClient: createAuthClientMock,
}));

const createStubAuthClient = (): AuthClient => {
  const session: AuthSession = {
    isAuthenticated: false,
    account: null,
  };

  return {
    initialize: vi.fn(async () => {}),
    getSession: () => session,
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    getAccessToken: vi.fn(async () => 'token'),
  };
};

describe('app auth client resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    createAuthClientMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns one shared auth client instance for non-localhost environments', async () => {
    const stubClient = createStubAuthClient();
    createAuthClientMock.mockReturnValue(stubClient);

    const { resolveAppAuthClient } = await import('./authClientResolver');

    const firstClient = resolveAppAuthClient();
    const secondClient = resolveAppAuthClient();

    expect(firstClient).toBe(stubClient);
    expect(secondClient).toBe(stubClient);
    expect(createAuthClientMock).toHaveBeenCalledTimes(1);
  });

  it('uses localhost test override client when available', async () => {
    const overrideClient = createStubAuthClient();
    createAuthClientMock.mockReturnValue(createStubAuthClient());

    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1' },
      __CONSPECTUS_AUTH_CLIENT__: overrideClient,
    });

    const { resolveAppAuthClient } = await import('./authClientResolver');

    expect(resolveAppAuthClient()).toBe(overrideClient);
    expect(createAuthClientMock).not.toHaveBeenCalled();
  });

  it('initializes the resolved shared client', async () => {
    const stubClient = createStubAuthClient();
    createAuthClientMock.mockReturnValue(stubClient);

    const { initializeAppAuthClient } = await import('./authClientResolver');

    await initializeAppAuthClient();

    expect(stubClient.initialize).toHaveBeenCalledTimes(1);
  });
});
