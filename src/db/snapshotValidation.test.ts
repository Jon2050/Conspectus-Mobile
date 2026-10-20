import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBrowserDbRuntime } from './browserDbRuntime';
import { createSqliteSnapshotValidator } from './snapshotValidation';
import { createNodeSqlJsRuntimeLoader } from '../shared/testUtils/dbIntegration';

const schema = fs.readFileSync('docs/reference/conspectus-live-schema.sql', 'utf8');
const referenceData = `
  INSERT INTO account_type VALUES (1, 'Income'), (2, 'Spendings'), (3, 'Standard');
  INSERT INTO account (account_id, name, ac_type_id) VALUES (1, 'Income', 1), (2, 'Spendings', 2), (3, 'Bank', 3);
  INSERT INTO transfer_type VALUES (1, 'Expense'), (2, 'Income'), (3, 'Internal');
`;

const snapshot = async (sql: string) => {
  const module = await createNodeSqlJsRuntimeLoader().load();
  const db = new module.Database();
  try {
    db.exec(sql);
    return db.export();
  } finally {
    db.close();
  }
};
const validator = () =>
  createSqliteSnapshotValidator(createBrowserDbRuntime(createNodeSqlJsRuntimeLoader()));

describe('snapshot import validation', () => {
  it('accepts the unchanged desktop schema and its reference data', async () => {
    await expect(
      validator().validate(await snapshot(schema + referenceData)),
    ).resolves.toBeUndefined();
  });
  it.each([
    ['unrelated SQLite', 'CREATE TABLE other(x);'],
    [
      'names without usable columns',
      'CREATE TABLE account(x); CREATE TABLE category(x); CREATE TABLE transfer(x);',
    ],
    ['missing primary accounts', schema],
    [
      'ambiguous primary accounts',
      schema + referenceData + 'INSERT INTO account (account_id, ac_type_id) VALUES (9, 2);',
    ],
    [
      'missing transfer types',
      schema + referenceData + 'DELETE FROM transfer_type WHERE transfer_type_id=3;',
    ],
    [
      'foreign key violation',
      schema +
        referenceData +
        "INSERT INTO transfer (name, from_account, to_account, transfer_type_id) VALUES ('bad', 999, 2, 1);",
    ],
    [
      'logical reference without FK declarations',
      schema.replace(
        /CREATE TABLE transfer\(.*\);/,
        'CREATE TABLE transfer(transfer_id INTEGER PRIMARY KEY, name TEXT, from_account INTEGER, to_account INTEGER, amount INTEGER, transfer_type_id INTEGER, category_1_id INTEGER, category_2_id INTEGER, category_3_id INTEGER, date INTEGER, buyplace TEXT);',
      ) +
        referenceData +
        "INSERT INTO transfer (name, from_account, to_account, transfer_type_id) VALUES ('orphan', 999, 2, 1);",
    ],
  ])('rejects %s before adoption', async (_name, sql) => {
    await expect(validator().validate(await snapshot(sql))).rejects.toMatchObject({
      code: 'db_open_failed',
    });
  });
  it('rejects corrupt bytes', async () => {
    await expect(validator().validate(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'db_open_failed',
    });
  });
});

// Explicit opt-in: deterministic synthetic data, local timings, no user DB or external service.
it.runIf(process.env.AP3_MEASURE === '1')('measures representative SQLite workloads', async () => {
  const results = [];
  for (const count of [1_000, 10_000, 100_000]) {
    const loader = createNodeSqlJsRuntimeLoader();
    let start = performance.now();
    const sql = await loader.load();
    const wasmMs = performance.now() - start;
    const db = new sql.Database();
    db.exec(schema + referenceData);
    db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < ${count})
      INSERT INTO transfer (name, from_account, to_account, amount, transfer_type_id, date, buyplace)
      SELECT 'Synthetic transfer ' || x, 3, 2, 1234, 1, 20000 + x % 365, 'Synthetic store' FROM n;`);
    const bytes = db.export();
    db.close();
    start = performance.now();
    new Uint8Array(bytes);
    const copyMs = performance.now() - start;
    const runtime = createBrowserDbRuntime(loader);
    start = performance.now();
    await runtime.open(bytes);
    const openMs = performance.now() - start;
    start = performance.now();
    const { validateOpenedConspectusDatabase } = await import('./snapshotValidation');
    validateOpenedConspectusDatabase(runtime);
    const validateMs = performance.now() - start;
    start = performance.now();
    runtime.exec('SELECT * FROM transfer WHERE date BETWEEN 20000 AND 20030;');
    const queryMs = performance.now() - start;
    start = performance.now();
    runtime.exportBytes();
    const exportMs = performance.now() - start;
    runtime.close();
    results.push({
      count,
      bytes: bytes.length,
      wasmMs,
      copyMs,
      openMs,
      validateMs,
      queryMs,
      exportMs,
    });
  }
  fs.mkdirSync('output/ap3', { recursive: true });
  fs.writeFileSync('output/ap3/database-measurements.json', JSON.stringify(results, null, 2));
  expect(results).toHaveLength(3);
});
