import { createAuthClient, type AuthClient } from '@auth';

declare global {
  interface Window {
    __CONSPECTUS_AUTH_CLIENT__?: AuthClient;
  }
}

let sharedAuthClient: AuthClient | null = null;

const isLocalAuthMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

export const resolveAppAuthClient = (): AuthClient => {
  if (isLocalAuthMockHost() && window.__CONSPECTUS_AUTH_CLIENT__ !== undefined) {
    return window.__CONSPECTUS_AUTH_CLIENT__;
  }

  if (sharedAuthClient === null) {
    sharedAuthClient = createAuthClient();
  }

  return sharedAuthClient;
};

export const initializeAppAuthClient = async (): Promise<void> => {
  await resolveAppAuthClient().initialize();
};
