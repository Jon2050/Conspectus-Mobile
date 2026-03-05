import {
  BrowserAuthErrorCodes,
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  InteractionRequiredAuthErrorCodes,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  type EndSessionRequest,
  type RedirectRequest,
  type SilentRequest,
} from '@azure/msal-browser';
import { loadRuntimeEnv } from '@shared';

import type { AuthAccount, AuthClient, AuthErrorCode, AuthSession } from './index';
import { AUTH_REQUEST_SCOPES } from './scopes';

const MSAL_CONSUMERS_AUTHORITY = 'https://login.microsoftonline.com/consumers';

type MsalInstance = {
  initialize(): Promise<void>;
  handleRedirectPromise(): Promise<AuthenticationResult | null>;
  getActiveAccount(): AccountInfo | null;
  setActiveAccount(account: AccountInfo | null): void;
  getAllAccounts(): AccountInfo[];
  loginRedirect(request?: RedirectRequest): Promise<void>;
  logoutRedirect(logoutRequest?: EndSessionRequest): Promise<void>;
  acquireTokenSilent(request: SilentRequest): Promise<AuthenticationResult>;
};

export interface CreateAuthClientOptions {
  readonly msalInstance?: MsalInstance;
}

class AuthClientError extends Error {
  readonly code: AuthErrorCode;
  readonly cause?: unknown;

  constructor(code: AuthErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AuthClientError';
    this.code = code;
    this.cause = cause;
  }
}

const INTERACTION_REQUIRED_CODES = new Set<string>([
  InteractionRequiredAuthErrorCodes.badToken,
  InteractionRequiredAuthErrorCodes.consentRequired,
  InteractionRequiredAuthErrorCodes.interactionRequired,
  InteractionRequiredAuthErrorCodes.interruptedUser,
  InteractionRequiredAuthErrorCodes.loginRequired,
  InteractionRequiredAuthErrorCodes.nativeAccountUnavailable,
  InteractionRequiredAuthErrorCodes.noTokensFound,
  InteractionRequiredAuthErrorCodes.refreshTokenExpired,
  InteractionRequiredAuthErrorCodes.uxNotAllowed,
]);

const NETWORK_ERROR_CODES = new Set<string>([
  BrowserAuthErrorCodes.getRequestFailed,
  BrowserAuthErrorCodes.noNetworkConnectivity,
  BrowserAuthErrorCodes.postRequestFailed,
]);

const extractErrorCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const errorCode = (error as { errorCode?: unknown }).errorCode;
  return typeof errorCode === 'string' ? errorCode : null;
};

const extractErrorMessage = (error: unknown): string | null => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const errorMessage = (error as { errorMessage?: unknown }).errorMessage;
  return typeof errorMessage === 'string' ? errorMessage : null;
};

const normalizeAuthError = (error: unknown, fallbackMessage: string): AuthClientError => {
  if (error instanceof AuthClientError) {
    return error;
  }

  const errorCode = extractErrorCode(error);

  if (
    error instanceof InteractionRequiredAuthError ||
    (errorCode !== null && INTERACTION_REQUIRED_CODES.has(errorCode))
  ) {
    return new AuthClientError(
      'interaction_required',
      'User interaction is required to continue authentication.',
      error,
    );
  }

  if (errorCode === BrowserAuthErrorCodes.uninitializedPublicClientApplication) {
    return new AuthClientError(
      'not_initialized',
      'Auth client is not initialized. Call initialize() before using auth operations.',
      error,
    );
  }

  if (errorCode === BrowserAuthErrorCodes.noAccountError) {
    return new AuthClientError(
      'no_active_account',
      'No active account is available. Sign in and try again.',
      error,
    );
  }

  if (errorCode !== null && NETWORK_ERROR_CODES.has(errorCode)) {
    return new AuthClientError(
      'network_error',
      'Authentication network request failed. Check your connection and try again.',
      error,
    );
  }

  return new AuthClientError('unknown', extractErrorMessage(error) ?? fallbackMessage, error);
};

const normalizeTokenScopes = (scopes: readonly string[]): string[] => [
  ...new Set(scopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0)),
];

const compareAccounts = (left: AccountInfo, right: AccountInfo): number => {
  const usernameComparison = left.username.localeCompare(right.username);
  if (usernameComparison !== 0) {
    return usernameComparison;
  }

  return left.homeAccountId.localeCompare(right.homeAccountId);
};

const resolvePreferredAccount = (
  msalInstance: MsalInstance,
  redirectResult: AuthenticationResult | null,
): AccountInfo | null => {
  if (redirectResult?.account !== null && redirectResult?.account !== undefined) {
    return redirectResult.account;
  }

  const activeAccount = msalInstance.getActiveAccount();
  if (activeAccount !== null) {
    return activeAccount;
  }

  const allAccounts = msalInstance.getAllAccounts();
  if (allAccounts.length === 0) {
    return null;
  }

  return [...allAccounts].sort(compareAccounts)[0] ?? null;
};

const toAuthAccount = (account: AccountInfo | null): AuthAccount | null => {
  if (account === null) {
    return null;
  }

  return {
    homeAccountId: account.homeAccountId,
    username: account.username,
    displayName: account.name ?? null,
  };
};

const createMsalConfiguration = (clientId: string): Configuration => ({
  auth: {
    clientId,
    authority: MSAL_CONSUMERS_AUTHORITY,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
  },
});

const createDefaultMsalInstance = (): MsalInstance => {
  const { VITE_AZURE_CLIENT_ID } = loadRuntimeEnv();
  return new PublicClientApplication(createMsalConfiguration(VITE_AZURE_CLIENT_ID));
};

const notInitializedError = (): AuthClientError =>
  new AuthClientError(
    'not_initialized',
    'Auth client is not initialized. Call initialize() before using auth operations.',
  );

const ensureActiveAccount = (msalInstance: MsalInstance): AccountInfo => {
  const activeAccount = msalInstance.getActiveAccount();
  if (activeAccount === null) {
    throw new AuthClientError(
      'no_active_account',
      'No active account is available. Sign in and try again.',
    );
  }

  return activeAccount;
};

export const createAuthClient = (options: CreateAuthClientOptions = {}): AuthClient => {
  let msalInstance: MsalInstance | null = options.msalInstance ?? null;
  let isInitialized = false;

  const resolveMsalInstance = (): MsalInstance => {
    if (msalInstance !== null) {
      return msalInstance;
    }

    msalInstance = createDefaultMsalInstance();
    return msalInstance;
  };

  const assertInitialized = (): void => {
    if (!isInitialized) {
      throw notInitializedError();
    }
  };

  return {
    async initialize(): Promise<void> {
      if (isInitialized) {
        return;
      }

      try {
        const resolvedMsalInstance = resolveMsalInstance();
        await resolvedMsalInstance.initialize();
        const redirectResult = await resolvedMsalInstance.handleRedirectPromise();
        const preferredAccount = resolvePreferredAccount(resolvedMsalInstance, redirectResult);
        if (preferredAccount !== null) {
          resolvedMsalInstance.setActiveAccount(preferredAccount);
        }
        isInitialized = true;
      } catch (error) {
        throw normalizeAuthError(error, 'Failed to initialize authentication.');
      }
    },

    getSession(): AuthSession {
      if (!isInitialized) {
        return {
          isAuthenticated: false,
          account: null,
        };
      }

      const activeAccount = resolveMsalInstance().getActiveAccount();
      return {
        isAuthenticated: activeAccount !== null,
        account: toAuthAccount(activeAccount),
      };
    },

    async signIn(): Promise<void> {
      assertInitialized();

      const signInRequest: RedirectRequest = {
        scopes: [...AUTH_REQUEST_SCOPES],
        prompt: 'select_account',
      };

      try {
        await resolveMsalInstance().loginRedirect(signInRequest);
      } catch (error) {
        throw normalizeAuthError(error, 'Sign-in failed.');
      }
    },

    async signOut(): Promise<void> {
      assertInitialized();

      const resolvedMsalInstance = resolveMsalInstance();
      const activeAccount = resolvedMsalInstance.getActiveAccount();
      const logoutRequest = activeAccount !== null ? { account: activeAccount } : undefined;

      resolvedMsalInstance.setActiveAccount(null);

      try {
        await resolvedMsalInstance.logoutRedirect(logoutRequest);
      } catch (error) {
        if (activeAccount !== null) {
          resolvedMsalInstance.setActiveAccount(activeAccount);
        }
        throw normalizeAuthError(error, 'Sign-out failed.');
      }
    },

    async getAccessToken(scopes: readonly string[]): Promise<string> {
      assertInitialized();

      const resolvedMsalInstance = resolveMsalInstance();
      const activeAccount = ensureActiveAccount(resolvedMsalInstance);
      const normalizedScopes = normalizeTokenScopes(scopes);
      if (normalizedScopes.length === 0) {
        throw new AuthClientError(
          'unknown',
          'At least one scope must be provided for token acquisition.',
        );
      }

      const tokenRequest: SilentRequest = {
        account: activeAccount,
        scopes: normalizedScopes,
      };

      try {
        const tokenResult = await resolvedMsalInstance.acquireTokenSilent(tokenRequest);
        if (tokenResult.account !== null) {
          resolvedMsalInstance.setActiveAccount(tokenResult.account);
        }
        return tokenResult.accessToken;
      } catch (error) {
        throw normalizeAuthError(error, 'Access token acquisition failed.');
      }
    },
  };
};
