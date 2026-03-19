// Verifies the app-shell DB runtime resolver honors localhost overrides and default singleton usage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserDbRuntime } from '@db';

const { appBrowserDbRuntimeMock } = vi.hoisted(() => ({
  appBrowserDbRuntimeMock: {
    open: vi.fn(async () => {}),
    close: vi.fn(() => {}),
    isOpen: vi.fn(() => false),
    exec: vi.fn(() => []),
    exportBytes: vi.fn(() => Uint8Array.from([1, 2, 3])),
  } satisfies BrowserDbRuntime,
}));

vi.mock('@db', () => ({
  appBrowserDbRuntime: appBrowserDbRuntimeMock,
}));

describe('db runtime resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the shared app db runtime outside localhost test overrides', async () => {
    const { resolveAppDbRuntime } = await import('./dbRuntimeResolver');

    expect(resolveAppDbRuntime()).toBe(appBrowserDbRuntimeMock);
  });

  it('uses localhost override runtime when a valid test override is present', async () => {
    const overrideRuntime: BrowserDbRuntime = {
      open: vi.fn(async () => {}),
      close: vi.fn(() => {}),
      isOpen: vi.fn(() => true),
      exec: vi.fn(() => []),
      exportBytes: vi.fn(() => Uint8Array.from([4, 5, 6])),
    };

    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
      __CONSPECTUS_APP_DB_RUNTIME__: overrideRuntime,
    });

    const { resolveAppDbRuntime } = await import('./dbRuntimeResolver');

    expect(resolveAppDbRuntime()).toBe(overrideRuntime);
  });
});
