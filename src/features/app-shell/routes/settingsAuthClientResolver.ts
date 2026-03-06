import { createAuthClient, type AuthClient } from '@auth';

declare global {
  interface Window {
    __CONSPECTUS_AUTH_CLIENT__?: AuthClient;
  }
}

export const resolveSettingsAuthClient = (): AuthClient => {
  const isE2eAuthMockEnabled = import.meta.env.VITE_E2E_AUTH_MOCK_ENABLED === '1';

  if (typeof window === 'undefined') {
    return createAuthClient();
  }

  if (isE2eAuthMockEnabled && window.__CONSPECTUS_AUTH_CLIENT__ !== undefined) {
    return window.__CONSPECTUS_AUTH_CLIENT__;
  }

  return createAuthClient();
};
