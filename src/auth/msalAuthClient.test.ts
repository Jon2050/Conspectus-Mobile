import {
  BrowserAuthErrorCodes,
  InteractionRequiredAuthError,
  InteractionRequiredAuthErrorCodes,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-browser';
import { describe, expect, it, vi } from 'vitest';

import { createAuthClient } from './index';
import { AUTH_REQUEST_SCOPES } from './scopes';

type CreateAuthClientArg = NonNullable<Parameters<typeof createAuthClient>[0]>;
type MsalInstance = NonNullable<CreateAuthClientArg['msalInstance']>;

interface MockMsalOptions {
  readonly redirectResult?: AuthenticationResult | null;
  readonly initialActiveAccount?: AccountInfo | null;
  readonly cachedAccounts?: AccountInfo[];
  readonly silentResult?: AuthenticationResult;
  readonly silentError?: unknown;
  readonly logoutError?: unknown;
}

const createAccount = (username: string, homeAccountId: string): AccountInfo => ({
  homeAccountId,
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username,
  localAccountId: `${homeAccountId}-local`,
  name: `Name ${username}`,
});

const createAuthenticationResult = (
  account: AccountInfo,
  accessToken = 'token-value',
): AuthenticationResult => ({
  authority: 'https://login.microsoftonline.com/consumers',
  uniqueId: account?.localAccountId ?? 'unique-id',
  tenantId: account?.tenantId ?? 'tenant-id',
  scopes: ['Files.ReadWrite'],
  account,
  idToken: 'id-token',
  idTokenClaims: {},
  accessToken,
  fromCache: true,
  expiresOn: new Date('2099-01-01T00:00:00.000Z'),
  tokenType: 'Bearer',
  correlationId: 'correlation-id',
});

const createMockMsalInstance = (options: MockMsalOptions = {}) => {
  let activeAccount = options.initialActiveAccount ?? null;
  const cachedAccounts = options.cachedAccounts ?? [];

  const initialize = vi.fn(async () => {});
  const handleRedirectPromise = vi.fn(async () => options.redirectResult ?? null);
  const getActiveAccount = vi.fn(() => activeAccount);
  const setActiveAccount = vi.fn((account: AccountInfo | null) => {
    activeAccount = account;
  });
  const getAllAccounts = vi.fn(() => [...cachedAccounts]);
  const loginRedirect = vi.fn(async () => {});
  const logoutRedirect = vi.fn(async () => {
    if (options.logoutError !== undefined) {
      throw options.logoutError;
    }
  });
  const acquireTokenSilent = vi.fn(async () => {
    if (options.silentError !== undefined) {
      throw options.silentError;
    }

    return (
      options.silentResult ??
      createAuthenticationResult(
        activeAccount ?? createAccount('fallback@example.com', 'fallback-home'),
        'silent-token',
      )
    );
  });

  const instance: MsalInstance = {
    initialize,
    handleRedirectPromise,
    getActiveAccount,
    setActiveAccount,
    getAllAccounts,
    loginRedirect,
    logoutRedirect,
    acquireTokenSilent,
  };

  return {
    instance,
    handleRedirectPromise,
    setActiveAccount,
    loginRedirect,
    logoutRedirect,
    acquireTokenSilent,
    getActiveAccountValue: (): AccountInfo | null => activeAccount,
  };
};

describe('createAuthClient', () => {
  it('returns an unauthenticated session before initialization', () => {
    const mockMsal = createMockMsalInstance();
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    expect(client.getSession()).toEqual({
      isAuthenticated: false,
      account: null,
    });
  });

  it('restores active account from redirect result during initialization', async () => {
    const redirectAccount = createAccount('redirect@example.com', 'redirect-home');
    const existingAccount = createAccount('existing@example.com', 'existing-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: existingAccount,
      redirectResult: createAuthenticationResult(redirectAccount),
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    expect(mockMsal.handleRedirectPromise).toHaveBeenCalledTimes(1);
    expect(mockMsal.setActiveAccount).toHaveBeenCalledWith(redirectAccount);
    expect(client.getSession()).toEqual({
      isAuthenticated: true,
      account: {
        homeAccountId: redirectAccount.homeAccountId,
        username: redirectAccount.username,
        displayName: redirectAccount.name ?? null,
      },
    });
  });

  it('restores deterministic cached account when no active account exists', async () => {
    const accountZ = createAccount('zeta@example.com', 'zeta-home');
    const accountA = createAccount('alpha@example.com', 'alpha-home');
    const mockMsal = createMockMsalInstance({
      cachedAccounts: [accountZ, accountA],
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    expect(mockMsal.getActiveAccountValue()).toEqual(accountA);
  });

  it('acquires token silently when a session exists', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
      silentResult: createAuthenticationResult(activeAccount, 'graph-token'),
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();
    const token = await client.getAccessToken(['Files.ReadWrite', 'Files.ReadWrite']);

    expect(token).toBe('graph-token');
    expect(mockMsal.acquireTokenSilent).toHaveBeenCalledWith({
      account: activeAccount,
      scopes: ['Files.ReadWrite'],
    });
    expect(mockMsal.loginRedirect).not.toHaveBeenCalled();
  });

  it('maps interaction-required token failures to the stable interaction_required code', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const interactionError = new InteractionRequiredAuthError(
      InteractionRequiredAuthErrorCodes.loginRequired,
      'login required',
    );
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
      silentError: interactionError,
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    await expect(client.getAccessToken(['Files.ReadWrite'])).rejects.toMatchObject({
      code: 'interaction_required',
    });
  });

  it('maps network token failures to the stable network_error code', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
      silentError: {
        errorCode: BrowserAuthErrorCodes.noNetworkConnectivity,
        errorMessage: 'Network unavailable',
      },
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    await expect(client.getAccessToken(['Files.ReadWrite'])).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('maps unexpected token failures to unknown and preserves message text', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
      silentError: new Error('unexpected token failure'),
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    await expect(client.getAccessToken(['Files.ReadWrite'])).rejects.toMatchObject({
      code: 'unknown',
      message: 'unexpected token failure',
    });
  });

  it('returns no_active_account when token is requested without an active session', async () => {
    const mockMsal = createMockMsalInstance();
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    await expect(client.getAccessToken(['Files.ReadWrite'])).rejects.toMatchObject({
      code: 'no_active_account',
    });
  });

  it('throws not_initialized before interactive auth operations are used', async () => {
    const mockMsal = createMockMsalInstance();
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await expect(client.signIn()).rejects.toMatchObject({ code: 'not_initialized' });
    await expect(client.signOut()).rejects.toMatchObject({ code: 'not_initialized' });
    await expect(client.getAccessToken(['Files.ReadWrite'])).rejects.toMatchObject({
      code: 'not_initialized',
    });
  });

  it('uses approved scopes and account picker prompt for sign-in', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();
    await client.signIn();

    expect(mockMsal.loginRedirect).toHaveBeenCalledWith({
      scopes: [...AUTH_REQUEST_SCOPES],
      prompt: 'select_account',
    });
  });

  it('clears active account and logs out against the active account context', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();
    await client.signOut();

    expect(mockMsal.setActiveAccount).toHaveBeenLastCalledWith(null);
    expect(mockMsal.logoutRedirect).toHaveBeenCalledWith({ account: activeAccount });
  });

  it('restores the prior active account when sign-out fails', async () => {
    const activeAccount = createAccount('active@example.com', 'active-home');
    const mockMsal = createMockMsalInstance({
      initialActiveAccount: activeAccount,
      logoutError: new Error('logout failed'),
    });
    const client = createAuthClient({ msalInstance: mockMsal.instance });

    await client.initialize();

    await expect(client.signOut()).rejects.toMatchObject({
      code: 'unknown',
      message: 'logout failed',
    });
    expect(mockMsal.setActiveAccount).toHaveBeenLastCalledWith(activeAccount);
  });
});
