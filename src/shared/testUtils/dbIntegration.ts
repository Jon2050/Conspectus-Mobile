/**
 * Database integration test utilities.
 * Provides functions to load the SQLite fixture and the WASM runtime in Node environments.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createSqlJsLoader } from '@db';

const resolveNodeWasmPath = (): string =>
  path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

const resolveTransferFixturePath = (): string =>
  path.resolve(process.cwd(), 'tests/fixtures/test.db');

export const createNodeSqlJsRuntimeLoader = () =>
  createSqlJsLoader({
    resolveWasmAssetUrl: resolveNodeWasmPath,
  });

export const loadTransferFixtureBytes = (): Uint8Array =>
  Uint8Array.from(fs.readFileSync(resolveTransferFixturePath()));
