export type AuthErrorCode =
  | 'not_initialized'
  | 'interaction_required'
  | 'no_active_account'
  | 'network_error'
  | 'unknown';

export interface AuthAccount {
  readonly homeAccountId: string;
  readonly username: string;
  readonly displayName: string | null;
}

export interface AuthSession {
  readonly isAuthenticated: boolean;
  readonly account: AuthAccount | null;
}

export interface AuthClient {
  initialize(): Promise<void>;
  getSession(): AuthSession;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(scopes: readonly string[]): Promise<string>;
}

export interface AuthError {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export { createAuthClient } from './msalAuthClient';
export { AUTH_OIDC_SCOPES, GRAPH_ONEDRIVE_FILE_SCOPES, AUTH_REQUEST_SCOPES } from './scopes';
export type { AuthRequestScope } from './scopes';
