// Resolves the shared browser DB runtime instance and localhost test overrides.
import { resolveAppBrowserDbRuntime, type BrowserDbRuntime } from '@db';

export const resolveAppDbRuntime = (): BrowserDbRuntime => {
  return resolveAppBrowserDbRuntime();
};
