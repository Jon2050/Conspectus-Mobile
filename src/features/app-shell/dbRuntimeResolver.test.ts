// Verifies the app-shell DB runtime resolver delegates to the DB module runtime resolver.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserDbRuntime } from '@db';

const { resolvedRuntimeMock, resolveAppBrowserDbRuntimeMock } = vi.hoisted(() => ({
  resolvedRuntimeMock: {
    open: vi.fn(async () => {}),
    close: vi.fn(() => {}),
    isOpen: vi.fn(() => false),
    exec: vi.fn(() => []),
    exportBytes: vi.fn(() => Uint8Array.from([1, 2, 3])),
  } satisfies BrowserDbRuntime,
  resolveAppBrowserDbRuntimeMock: vi.fn(),
}));

vi.mock('@db', () => ({
  resolveAppBrowserDbRuntime: resolveAppBrowserDbRuntimeMock,
}));

describe('db runtime resolver', () => {
  beforeEach(() => {
    vi.resetModules();
    resolveAppBrowserDbRuntimeMock.mockReset();
    resolveAppBrowserDbRuntimeMock.mockReturnValue(resolvedRuntimeMock);
  });

  it('returns the DB module app runtime resolution result', async () => {
    const { resolveAppDbRuntime } = await import('./dbRuntimeResolver');

    expect(resolveAppDbRuntime()).toBe(resolvedRuntimeMock);
    expect(resolveAppBrowserDbRuntimeMock).toHaveBeenCalledTimes(1);
  });
});
