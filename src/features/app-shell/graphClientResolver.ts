/** Resolves a shared Graph client instance and supports localhost test overrides for UI flows. */
import { createGraphClient, type GraphClient } from '@graph';

import { resolveAppAuthClient } from './authClientResolver';

declare global {
  interface Window {
    __CONSPECTUS_GRAPH_CLIENT__?: GraphClient;
  }
}

let sharedGraphClient: GraphClient | null = null;

const isLocalGraphMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

export const resolveAppGraphClient = (): GraphClient => {
  if (isLocalGraphMockHost() && window.__CONSPECTUS_GRAPH_CLIENT__ !== undefined) {
    return window.__CONSPECTUS_GRAPH_CLIENT__;
  }

  if (sharedGraphClient === null) {
    sharedGraphClient = createGraphClient({
      authClient: resolveAppAuthClient(),
    });
  }

  return sharedGraphClient;
};
