import { describe, expect, it, vi } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';

import { AUTH_REQUEST_SCOPES, createAuthClient } from './index';

type CreateAuthClientArg = NonNullable<Parameters<typeof createAuthClient>[0]>;
type MsalInstance = NonNullable<CreateAuthClientArg['msalInstance']>;

const createMinimalMsalInstance = (): MsalInstance => {
  let activeAccount: AccountInfo | null = null;

  return {
    initialize: vi.fn(async () => {}),
    handleRedirectPromise: vi.fn(async () => null),
    getActiveAccount: vi.fn(() => activeAccount),
    setActiveAccount: vi.fn((account: AccountInfo | null) => {
      activeAccount = account;
    }),
    getAllAccounts: vi.fn(() => []),
    loginRedirect: vi.fn(async () => {}),
    logoutRedirect: vi.fn(async () => {}),
    acquireTokenSilent: vi.fn(async () => ({
      authority: 'https://login.microsoftonline.com/consumers',
      uniqueId: 'unique-id',
      tenantId: 'tenant-id',
      scopes: ['Files.ReadWrite'],
      account:
        activeAccount ??
        ({
          homeAccountId: 'fallback-home',
          environment: 'login.microsoftonline.com',
          tenantId: 'tenant-id',
          username: 'fallback@example.com',
          localAccountId: 'fallback-local',
          name: 'Fallback User',
        } as AccountInfo),
      idToken: 'id-token',
      idTokenClaims: {},
      accessToken: 'token-value',
      fromCache: true,
      expiresOn: new Date('2099-01-01T00:00:00.000Z'),
      tokenType: 'Bearer',
      correlationId: 'correlation-id',
    })),
  };
};

describe('auth barrel contract', () => {
  it('exports an auth client factory with the stable method surface', () => {
    const client = createAuthClient({ msalInstance: createMinimalMsalInstance() });

    expect(client).toEqual(
      expect.objectContaining({
        initialize: expect.any(Function),
        getSession: expect.any(Function),
        signIn: expect.any(Function),
        signOut: expect.any(Function),
        getAccessToken: expect.any(Function),
      }),
    );
  });

  it('keeps the approved auth request scopes available to callers', () => {
    expect(AUTH_REQUEST_SCOPES).toEqual(['openid', 'profile', 'offline_access', 'Files.ReadWrite']);
  });
});
