// Verifies browser DB runtime open/close lifecycle, pragma setup, and deterministic failure normalization.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SqlJsStatic } from 'sql.js';

import { createBrowserDbRuntime } from './browserDbRuntime';
import { DbRuntimeError } from './dbRuntimeErrors';
import { createSqlJsLoader } from './sqlJsLoader';

const resolveNodeWasmPath = (): string =>
  path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

const createNodeSqlJsRuntimeLoader = () =>
  createSqlJsLoader({
    resolveWasmAssetUrl: resolveNodeWasmPath,
  });

const createFixtureSnapshotBytes = async (label: string): Promise<Uint8Array> => {
  const sqlJsRuntime: SqlJsStatic = await createNodeSqlJsRuntimeLoader().load();
  const database = new sqlJsRuntime.Database();

  database.exec(`
    CREATE TABLE sample (
      sample_id INTEGER PRIMARY KEY,
      label TEXT NOT NULL
    );
  `);
  database.run('INSERT INTO sample (label) VALUES (?);', [label]);

  const bytes = database.export();
  database.close();
  return bytes;
};

const createDeferred = <Value>() => {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve,
  };
};

describe('browser db runtime', () => {
  it('opens valid SQLite snapshot bytes and applies required startup pragmas', async () => {
    const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
    const snapshotBytes = await createFixtureSnapshotBytes('alpha');

    await runtime.open(snapshotBytes);

    const pragmaResult = runtime.exec('PRAGMA foreign_keys;');
    const sampleRows = runtime.exec('SELECT label FROM sample ORDER BY sample_id ASC;');

    expect(pragmaResult[0]?.values).toEqual([[1]]);
    expect(sampleRows[0]?.values).toEqual([['alpha']]);
    expect(runtime.exportBytes().length).toBeGreaterThan(0);
  });

  it('closes old state before reopening with new snapshot bytes', async () => {
    const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
    const firstBytes = await createFixtureSnapshotBytes('first');
    const secondBytes = await createFixtureSnapshotBytes('second');

    await runtime.open(firstBytes);
    expect(runtime.exec('SELECT label FROM sample ORDER BY sample_id ASC;')[0]?.values).toEqual([
      ['first'],
    ]);

    await runtime.open(secondBytes);
    expect(runtime.exec('SELECT label FROM sample ORDER BY sample_id ASC;')[0]?.values).toEqual([
      ['second'],
    ]);
  });

  it('throws deterministic errors when exporting or querying while closed', () => {
    const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
    try {
      runtime.exportBytes();
      throw new Error('Expected exportBytes() to throw when runtime is closed.');
    } catch (error) {
      expect(error).toBeInstanceOf(DbRuntimeError);
      expect((error as DbRuntimeError).code).toBe('db_not_open');
    }

    try {
      runtime.exec('SELECT 1;');
      throw new Error('Expected exec() to throw when runtime is closed.');
    } catch (error) {
      expect(error).toBeInstanceOf(DbRuntimeError);
      expect((error as DbRuntimeError).code).toBe('db_not_open');
    }
  });

  it('normalizes invalid snapshot bytes as deterministic open failures', async () => {
    const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());

    await expect(runtime.open(Uint8Array.from([1, 2, 3]))).rejects.toMatchObject({
      name: 'DbRuntimeError',
      code: 'db_open_failed',
    });
  });

  it('normalizes sql.js initialization failures as deterministic runtime init failures', async () => {
    const runtime = createBrowserDbRuntime({
      load: async () => {
        throw new Error('sql.js init failed');
      },
    });

    const snapshotBytes = await createFixtureSnapshotBytes('alpha');

    await expect(runtime.open(snapshotBytes)).rejects.toMatchObject({
      name: 'DbRuntimeError',
      code: 'db_runtime_init_failed',
    });
  });

  it('skips applying a DB open operation when the supersession guard is no longer current', async () => {
    const snapshotBytes = await createFixtureSnapshotBytes('alpha');
    const deferredSqlJsRuntime = createDeferred<SqlJsStatic>();
    const runtime = createBrowserDbRuntime({
      load: async () => deferredSqlJsRuntime.promise,
    });
    let operationIsCurrent = true;

    const openPromise = runtime.open(snapshotBytes, {
      canApply: () => operationIsCurrent,
    });

    operationIsCurrent = false;
    deferredSqlJsRuntime.resolve(await createNodeSqlJsRuntimeLoader().load());
    await openPromise;

    expect(runtime.isOpen()).toBe(false);
  });
});
