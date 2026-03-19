// Verifies sql.js runtime loading is cached and deterministic across transient initialization failures.
import { describe, expect, it, vi } from 'vitest';
import type { SqlJsConfig, SqlJsStatic } from 'sql.js';

import { createSqlJsLoader } from './sqlJsLoader';

const createStubSqlJsRuntime = (): SqlJsStatic =>
  ({
    Database: class {},
    Statement: class {},
  }) as unknown as SqlJsStatic;

describe('sql.js loader', () => {
  it('loads sql.js once and reuses the same runtime instance', async () => {
    const sqlJsRuntime = createStubSqlJsRuntime();
    const initSqlJsFactory = vi
      .fn<(config?: SqlJsConfig) => Promise<SqlJsStatic>>()
      .mockResolvedValue(sqlJsRuntime);
    const loader = createSqlJsLoader({
      initSqlJsFactory,
      resolveWasmAssetUrl: () => '/assets/sql-wasm.wasm',
    });

    await expect(loader.load()).resolves.toBe(sqlJsRuntime);
    await expect(loader.load()).resolves.toBe(sqlJsRuntime);

    expect(initSqlJsFactory).toHaveBeenCalledTimes(1);
    expect(initSqlJsFactory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        locateFile: expect.any(Function),
      }),
    );

    const initCallConfig = initSqlJsFactory.mock.calls.at(0)?.[0];
    if (initCallConfig === undefined) {
      throw new Error('sql.js init function should be called with runtime config.');
    }

    const typedInitCallConfig = initCallConfig as unknown as SqlJsConfig;
    expect(typedInitCallConfig.locateFile?.('sql-wasm.wasm', '')).toBe('/assets/sql-wasm.wasm');
  });

  it('resets the cached promise after init failures so a retry can succeed', async () => {
    const sqlJsRuntime = createStubSqlJsRuntime();
    const initSqlJsFactory = vi
      .fn<(config?: SqlJsConfig) => Promise<SqlJsStatic>>()
      .mockRejectedValueOnce(new Error('init failed once'))
      .mockResolvedValueOnce(sqlJsRuntime);
    const loader = createSqlJsLoader({
      initSqlJsFactory,
      resolveWasmAssetUrl: () => '/assets/sql-wasm.wasm',
    });

    await expect(loader.load()).rejects.toMatchObject({
      name: 'DbRuntimeError',
      code: 'db_runtime_init_failed',
    });

    await expect(loader.load()).resolves.toBe(sqlJsRuntime);
    expect(initSqlJsFactory).toHaveBeenCalledTimes(2);
  });
});
