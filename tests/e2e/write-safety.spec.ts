// Uses the real browser sql.js runtime and shared IndexedDB across two tabs.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import initSqlJs from 'sql.js';
import {
  appPath,
  installMockAuthClient,
  installMockStartupNetworkState,
  installPersistedBinding,
} from './support/app-test-harness';

test('two real SQLite tabs cannot overwrite a newer shared-cache snapshot', async ({ context }) => {
  let remoteBytes = Array.from(fs.readFileSync(path.resolve('tests/fixtures/test.db')));
  let remoteETag = 'v1';
  const uploads: { expectedETag: string; bytes: number[] }[] = [];
  const prepare = async (page: Page) => {
    await installMockAuthClient(page, { startAuthenticated: true });
    await installMockStartupNetworkState(page, true);
    await installPersistedBinding(page);
    await page.exposeFunction(
      '__AP1_REMOTE__',
      async (operation: string, bytes?: number[], expectedETag?: string) => {
        if (operation === 'metadata')
          return {
            eTag: remoteETag,
            sizeBytes: remoteBytes.length,
            lastModifiedDateTime: '2026-10-20T00:00:00Z',
          };
        if (operation === 'download') return remoteBytes;
        if (operation === 'upload' && bytes !== undefined && expectedETag !== undefined) {
          uploads.push({ expectedETag, bytes });
          if (expectedETag !== remoteETag) return { conflict: true };
          remoteBytes = bytes;
          remoteETag = 'v2';
          return {
            eTag: remoteETag,
            sizeBytes: bytes.length,
            lastModifiedDateTime: '2026-10-20T00:00:00Z',
          };
        }
        throw new Error('Unexpected synthetic Graph operation');
      },
    );
    await page.addInitScript(() => {
      const remote = (
        window as unknown as {
          __AP1_REMOTE__: (operation: string, bytes?: number[], eTag?: string) => Promise<unknown>;
        }
      ).__AP1_REMOTE__;
      (window as unknown as { __CONSPECTUS_GRAPH_CLIENT__: unknown }).__CONSPECTUS_GRAPH_CLIENT__ =
        {
          getFileMetadata: () => remote('metadata'),
          getFileDownloadUrl: async () => 'https://synthetic.invalid/test.db',
          downloadFile: async () => new Uint8Array((await remote('download')) as number[]),
          uploadFile: async (
            _binding: unknown,
            bytes: Uint8Array,
            eTag: string,
            _progress: unknown,
            assertContext?: () => void,
          ) => {
            assertContext?.();
            const result = (await remote('upload', Array.from(bytes), eTag)) as {
              conflict?: boolean;
            };
            if (result.conflict)
              throw { code: 'conflict', status: 412, message: 'Synthetic precondition failed' };
            return result;
          },
          listChildren: async () => [],
          resolveFileByPath: async (binding: unknown) => binding,
        };
    });
    await page.goto(appPath('#/add'));
    await expect(page.getByTestId('add-transfer-name')).toBeEnabled();
    await page.getByTestId('add-transfer-from-account').selectOption('3');
    await page.getByTestId('add-transfer-to-account').selectOption('4');
    await page.getByTestId('add-transfer-amount').pressSequentially('125');
  };
  const a = await context.newPage();
  await prepare(a);
  const b = await context.newPage();
  await prepare(b);
  await a.getByTestId('add-transfer-name').fill('Browser tab A');
  await a.getByTestId('add-transfer-submit').click();
  await expect(a.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  await b.getByTestId('add-transfer-name').fill('Browser tab B');
  await b.getByTestId('add-transfer-submit').click();
  await expect(b.getByTestId('add-transfer-conflict-dialog')).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]?.expectedETag).toBe('v1');
  const sql = await initSqlJs({
    locateFile: () => path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'),
  });
  const database = new sql.Database(Uint8Array.from(remoteBytes));
  try {
    expect(
      database.exec("SELECT name FROM transfer WHERE name LIKE 'Browser tab %' ORDER BY name")[0]
        ?.values,
    ).toEqual([['Browser tab A']]);
    expect(database.exec('PRAGMA foreign_key_check')).toEqual([]);
  } finally {
    database.close();
  }
});
