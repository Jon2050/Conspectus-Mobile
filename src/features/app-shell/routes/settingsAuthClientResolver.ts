import { createAuthClient, type AuthClient } from '@auth';

declare global {
  interface Window {
    __CONSPECTUS_AUTH_CLIENT__?: AuthClient;
  }
}

export const resolveSettingsAuthClient = (): AuthClient => {
  if (typeof window === 'undefined') {
    return createAuthClient();
  }

  const isLocalAuthMockHost =
    window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

  if (isLocalAuthMockHost && window.__CONSPECTUS_AUTH_CLIENT__ !== undefined) {
    return window.__CONSPECTUS_AUTH_CLIENT__;
  }

  return createAuthClient();
};
