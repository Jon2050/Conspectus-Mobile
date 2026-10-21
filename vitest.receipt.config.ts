import { defineConfig } from 'vitest/config';
import appConfig from './vite.config';

// Explicit opt-in: never picked up by npm test or CI's ordinary test suite.
export default defineConfig(async (environment) => {
  const config = await (typeof appConfig === 'function' ? appConfig(environment) : appConfig);
  return {
    ...config,
    test: {
      include: ['tests/live/receipt.live.test.ts'],
      environment: 'node',
      // Model discovery and diagnostic paths must remain visible, including in agent terminals.
      reporters: ['verbose'],
      silent: false,
      // A complete synthetic corpus has 13 sequential two-stage provider runs.
      testTimeout: 45 * 60_000,
      hookTimeout: 30_000,
      fileParallelism: false,
    },
  };
});
