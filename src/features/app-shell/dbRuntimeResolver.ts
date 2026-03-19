// Resolves the shared browser DB runtime instance and localhost test overrides.
import { appBrowserDbRuntime, type BrowserDbRuntime } from '@db';

declare global {
  interface Window {
    __CONSPECTUS_APP_DB_RUNTIME__?: BrowserDbRuntime;
  }
}

const isLocalDbRuntimeMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

const isBrowserDbRuntime = (value: unknown): value is BrowserDbRuntime => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<BrowserDbRuntime>;
  return (
    typeof candidate.open === 'function' &&
    typeof candidate.close === 'function' &&
    typeof candidate.isOpen === 'function' &&
    typeof candidate.exec === 'function' &&
    typeof candidate.exportBytes === 'function'
  );
};

export const resolveAppDbRuntime = (): BrowserDbRuntime => {
  if (isLocalDbRuntimeMockHost() && isBrowserDbRuntime(window.__CONSPECTUS_APP_DB_RUNTIME__)) {
    return window.__CONSPECTUS_APP_DB_RUNTIME__;
  }

  return appBrowserDbRuntime;
};
