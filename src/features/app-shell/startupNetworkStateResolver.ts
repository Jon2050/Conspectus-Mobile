// Resolves the online/offline state for startup freshness checks and supports localhost browser-test overrides.
declare global {
  interface Window {
    __CONSPECTUS_APP_STARTUP_IS_ONLINE__?: boolean;
  }
}

const isLocalStartupNetworkMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

export const resolveAppStartupIsOnline = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }

  if (
    isLocalStartupNetworkMockHost() &&
    typeof window.__CONSPECTUS_APP_STARTUP_IS_ONLINE__ === 'boolean'
  ) {
    return window.__CONSPECTUS_APP_STARTUP_IS_ONLINE__;
  }

  return window.navigator.onLine;
};
