// Validates current PWA SQL query services against the checked-in Conspectus schema snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createAccountQueryService,
  createBrowserDbRuntime,
  createCategoryQueryService,
  createTransferMonthQueryService,
} from './index';
import { createNodeSqlJsRuntimeLoader } from '../shared/testUtils/dbIntegration';

const SCHEMA_SNAPSHOT_PATH = path.resolve(
  process.cwd(),
  'docs/reference/conspectus-live-schema.sql',
);
const TEST_MONTH_ANCHOR_EPOCH_DAY = 20_089;

const REQUIRED_COLUMNS_BY_TABLE = {
  account: ['account_id', 'name', 'amount', 'ac_order', 'ac_type_id', 'visible'],
  category: ['category_id', 'name'],
  transfer: [
    'transfer_id',
    'name',
    'from_account',
    'to_account',
    'amount',
    'transfer_type_id',
    'category_1_id',
    'category_2_id',
    'category_3_id',
    'date',
    'buyplace',
  ],
} as const;

const createRuntimeFromSchemaSnapshot = async () => {
  const sqlJsRuntime = await createNodeSqlJsRuntimeLoader().load();
  const database = new sqlJsRuntime.Database();

  try {
    database.run(fs.readFileSync(SCHEMA_SNAPSHOT_PATH, 'utf8'));
    const snapshotBytes = database.export();
    const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
    await runtime.open(snapshotBytes);
    return runtime;
  } finally {
    database.close();
  }
};

const listColumnNames = (
  runtime: { exec: ReturnType<typeof createBrowserDbRuntime>['exec'] },
  tableName: string,
) => {
  const pragmaResult = runtime.exec(`PRAGMA table_info(${tableName});`);
  return pragmaResult[0]?.values.map((row) => row[1]) ?? [];
};

describe('Conspectus schema snapshot compatibility', () => {
  it('keeps the PWA read-query services compatible with the checked-in schema snapshot', async () => {
    const runtime = await createRuntimeFromSchemaSnapshot();

    try {
      expect(listColumnNames(runtime, 'account')).toEqual(REQUIRED_COLUMNS_BY_TABLE.account);
      expect(listColumnNames(runtime, 'category')).toEqual(REQUIRED_COLUMNS_BY_TABLE.category);
      expect(listColumnNames(runtime, 'transfer')).toEqual(REQUIRED_COLUMNS_BY_TABLE.transfer);

      const accountQueryService = createAccountQueryService(runtime);
      const categoryQueryService = createCategoryQueryService(runtime);
      const transferQueryService = createTransferMonthQueryService(runtime);

      expect(accountQueryService.listVisibleNonPrimaryAccounts()).toEqual([]);
      expect(accountQueryService.listAllAccounts()).toEqual([]);
      expect(categoryQueryService.listAllCategories()).toEqual([]);
      expect(transferQueryService.listTransfersByMonth(TEST_MONTH_ANCHOR_EPOCH_DAY)).toEqual([]);
    } finally {
      runtime.close();
    }
  });
});
