// Exercises transfer editing against real browser SQLite and inspects the uploaded database.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import {
  appPath,
  getGraphUploadCallCount,
  installMockAuthClient,
  installMockGraphClient,
  installMockCacheStore,
  installMockStartupNetworkState,
  installPersistedBinding,
} from './support/app-test-harness';

const fixtureBytes = Array.from(fs.readFileSync('tests/fixtures/test.db'));
const setup = async (
  page: Page,
  failUpload: boolean | 'conflict' = false,
  initialBytes = fixtureBytes,
  uploadDelayMs = 100,
) => {
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, {
    downloadBytes: initialBytes,
    uploadErrorSequence: failUpload
      ? [
          {
            code: failUpload === 'conflict' ? 'conflict' : 'network_error',
            message: 'Temporary failure',
          },
        ]
      : [],
    uploadDelayMs,
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await page.clock.setFixedTime(new Date('2024-04-15T12:00:00Z'));
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __CONSPECTUS_GRAPH_CLIENT__: {
        uploadFile: (...args: [unknown, Uint8Array, string, unknown?]) => Promise<unknown>;
      };
      transferTestUploads: number[][];
    };
    state.transferTestUploads = [];
    const upload = state.__CONSPECTUS_GRAPH_CLIENT__.uploadFile;
    state.__CONSPECTUS_GRAPH_CLIENT__.uploadFile = async (...args) => {
      state.transferTestUploads.push(Array.from(args[1]));
      return upload(...args);
    };
  });
  await page.goto(appPath('#/transfers'));
  await expect(page.getByTestId('transfer-card-2')).toBeVisible();
};
const uploadedDb = async (page: Page) => {
  const bytes = await page.evaluate(
    () =>
      (window as typeof window & { transferTestUploads: number[][] }).transferTestUploads.at(-1)!,
  );
  const sql = await initSqlJs({
    locateFile: (file) => path.resolve('node_modules/sql.js/dist', file),
  });
  return new sql.Database(new Uint8Array(bytes));
};
const openEditor = async (page: Page) => {
  await page.getByTestId('transfer-card-2').click();
  await expect(page.getByRole('dialog', { name: 'Edit transfer', exact: true })).toBeVisible();
};

test('prefills every field and closing discards unsaved changes without receipt controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await setup(page);
  await openEditor(page);
  const dialog = page.getByRole('dialog');
  const header = dialog.locator('.bottom-sheet__heading');
  const remove = header.getByTestId('edit-transfer-delete');
  await expect(remove).toBeVisible();
  await expect(dialog.getByTestId('bottom-sheet-close')).toHaveCount(0);
  const titleBounds = await header.getByRole('heading').boundingBox();
  const deleteBounds = await remove.boundingBox();
  expect(titleBounds).not.toBeNull();
  expect(deleteBounds).not.toBeNull();
  expect(deleteBounds!.x).toBeGreaterThanOrEqual(titleBounds!.x + titleBounds!.width);
  const hint = dialog.getByTestId('edit-transfer-balance-hint');
  await expect(hint).not.toHaveAttribute('open');
  await expect(hint.locator('p')).not.toBeVisible();
  await hint.locator('summary').click();
  await expect(hint.locator('p')).toContainText('updates the balances');
  await expect(hint.locator('p')).toBeVisible();
  await hint.locator('summary').click();
  const actions = dialog.locator('.add-transfer-form__actions');
  await actions.scrollIntoViewIfNeeded();
  const closeBounds = await actions.getByTestId('edit-transfer-close').boundingBox();
  const saveBounds = await actions.getByTestId('edit-transfer-submit').boundingBox();
  expect(closeBounds).not.toBeNull();
  expect(saveBounds).not.toBeNull();
  expect(closeBounds!.x + closeBounds!.width).toBeLessThanOrEqual(saveBounds!.x);
  expect(Math.abs(closeBounds!.y - saveBounds!.y)).toBeLessThan(2);
  await expect(page.getByTestId('add-transfer-date')).toHaveValue('2024-04-07');
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Groceries');
  await expect(page.getByTestId('add-transfer-buyplace')).toHaveValue('Market');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('45,99€');
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('3');
  await expect(page.getByTestId('add-transfer-to-account')).toHaveValue('2');
  await expect(page.getByTestId('add-transfer-category-1')).toHaveValue('1');
  await expect(page.getByTestId('add-transfer-category-2')).toHaveValue('-1');
  await expect(page.getByTestId('add-transfer-category-3')).toHaveValue('-1');
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await dialog.locator('.bottom-sheet__content').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: test.info().outputPath('transfer-editor.png') });
  await page.getByTestId('add-transfer-name').fill('Unsaved change');
  await page.getByTestId('edit-transfer-close').click();
  await expect(page.getByTestId('transfer-card-2')).toContainText('Groceries');
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await openEditor(page);
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Groceries');
});

test('saves all fields into the same transfer and refreshes the month and balances', async ({
  page,
}) => {
  await setup(page);
  await openEditor(page);
  await page.getByTestId('add-transfer-date').fill('2024-05-12');
  await page.getByTestId('add-transfer-name').fill('Changed booking');
  await page.getByTestId('add-transfer-buyplace').fill('New market');
  await page.getByTestId('add-transfer-amount').fill('12,34€');
  await page.getByTestId('add-transfer-from-account').selectOption('4');
  await page.getByTestId('add-transfer-to-account').selectOption('3');
  await page.getByTestId('add-transfer-category-1').selectOption('3');
  await page.getByTestId('add-transfer-category-2').selectOption('2');
  await page.getByTestId('add-transfer-category-3').selectOption('1');
  await page.getByTestId('edit-transfer-submit').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.toast-container')).toContainText('Transfer updated and uploaded.');
  await expect(page.getByTestId('transfer-card-2')).toHaveCount(0);
  await page.getByTestId('transfers-month-next-button').click();
  await expect(page.getByTestId('transfer-card-2')).toContainText('Changed booking');
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="3"]'),
  ).toHaveAttribute('data-amount-cents', '60833');
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="4"]'),
  ).toHaveAttribute('data-amount-cents', '6067');
  const db = await uploadedDb(page);
  expect(db.exec('SELECT * FROM transfer WHERE transfer_id = 2;')[0]?.values[0]).toEqual([
    2,
    'Changed booking',
    4,
    3,
    1234,
    3,
    3,
    2,
    1,
    19855,
    'New market',
  ]);
  expect(db.exec('SELECT count(*) FROM transfer;')[0]?.values[0]).toEqual([3]);
  db.close();
});

test('deletes the complete transfer even with invalid unsaved fields and reverses its balances', async ({
  page,
}) => {
  await setup(page);
  await openEditor(page);
  await page.getByTestId('add-transfer-name').fill('');
  await page.getByTestId('add-transfer-amount').fill('');
  await page.getByTestId('edit-transfer-delete').click();
  const confirmation = page.getByRole('dialog', { name: 'Delete transfer?', exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Groceries');
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await page.getByTestId('edit-transfer-delete-cancel').click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('');
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await page.getByTestId('edit-transfer-delete').click();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByTestId('edit-transfer-form')).toBeVisible();
  await page.getByTestId('edit-transfer-delete').click();
  await page.getByTestId('edit-transfer-delete-confirm').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('transfer-card-2')).toHaveCount(0);
  await expect(page.getByTestId('transfer-card-3')).toBeVisible();
  await expect(page.locator('.toast-container')).toContainText('Transfer deleted and uploaded.');
  const db = await uploadedDb(page);
  expect(db.exec('SELECT transfer_id FROM transfer ORDER BY transfer_id;')[0]?.values).toEqual([
    [1],
    [3],
  ]);
  expect(
    db.exec('SELECT amount FROM account WHERE account_id IN (2, 3) ORDER BY account_id;')[0]
      ?.values,
  ).toEqual([[-4599], [59599]]);
  db.close();
});

test('validates changes and blocks saving and deleting while offline', async ({
  page,
  context,
}) => {
  await setup(page);
  await openEditor(page);
  await page.getByTestId('add-transfer-name').fill('x');
  await page.getByTestId('edit-transfer-submit').click();
  await expect(page.getByRole('alert')).toContainText('longer than 2 characters');
  expect(await getGraphUploadCallCount(page)).toBe(0);
  await context.setOffline(true);
  await expect(page.getByTestId('edit-transfer-submit')).toBeDisabled();
  await expect(page.getByTestId('edit-transfer-delete')).toBeDisabled();
  await context.setOffline(false);
});

test('retains a failed edit across closing and navigation and retries exactly the same bytes', async ({
  page,
}) => {
  await setup(page, true);
  await openEditor(page);
  await page.getByTestId('add-transfer-name').fill('Retried edit');
  await page.getByTestId('edit-transfer-submit').click();
  await expect(page.getByTestId('edit-transfer-retry')).toBeVisible();
  await expect(page.getByTestId('edit-transfer-submit')).toHaveCount(0);
  await expect(page.getByTestId('edit-transfer-delete')).toBeDisabled();
  await page.getByTestId('edit-transfer-close').click();
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.getByTestId('pending-transfer-edit').getByRole('button').click();
  await page.getByTestId('edit-transfer-retry').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await getGraphUploadCallCount(page)).toBe(2);
  const uploads = await page.evaluate(
    () => (window as typeof window & { transferTestUploads: number[][] }).transferTestUploads,
  );
  expect(uploads[0]).toEqual(uploads[1]);
  const db = await uploadedDb(page);
  expect(db.exec('SELECT name FROM transfer WHERE transfer_id = 2;')[0]?.values[0]).toEqual([
    'Retried edit',
  ]);
  expect(db.exec('SELECT amount FROM account WHERE account_id = 3;')[0]?.values[0]).toEqual([
    55000,
  ]);
  db.close();
});

test('refreshes a conflict and saves again only after an explicit action', async ({ page }) => {
  await setup(page, 'conflict');
  await openEditor(page);
  await page.getByTestId('add-transfer-name').fill('Conflict edit');
  await page.getByTestId('edit-transfer-submit').click();
  await page.getByTestId('edit-transfer-conflict-refresh').click();
  await expect(page.getByTestId('edit-transfer-conflict-retry')).toBeVisible();
  expect(await getGraphUploadCallCount(page)).toBe(1);
  await page.getByTestId('edit-transfer-conflict-retry').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('transfer-card-2')).toContainText('Conflict edit');
  expect(await getGraphUploadCallCount(page)).toBe(2);
});

test('refuses to overwrite a transfer changed remotely during conflict recovery', async ({
  page,
}) => {
  await setup(page, 'conflict');
  await openEditor(page);
  await page.getByTestId('add-transfer-name').fill('My draft');
  await page.getByTestId('edit-transfer-submit').click();
  const sql = await initSqlJs({
    locateFile: (file) => path.resolve('node_modules/sql.js/dist', file),
  });
  const remote = new sql.Database(new Uint8Array(fixtureBytes));
  remote.exec("UPDATE transfer SET name = 'Changed remotely' WHERE transfer_id = 2;");
  const bytes = Array.from(remote.export());
  remote.close();
  await page.evaluate((remoteBytes) => {
    (
      window as typeof window & {
        __CONSPECTUS_GRAPH_CLIENT__: { downloadFile: () => Promise<Uint8Array> };
      }
    ).__CONSPECTUS_GRAPH_CLIENT__.downloadFile = async () => new Uint8Array(remoteBytes);
  }, bytes);
  await page.getByTestId('edit-transfer-conflict-refresh').click();
  await page.getByTestId('edit-transfer-conflict-retry').click();
  await expect(page.getByTestId('edit-transfer-error')).toContainText(
    'close this menu and reopen it',
  );
  expect(await getGraphUploadCallCount(page)).toBe(1);
  await page.getByTestId('edit-transfer-close').click();
  await expect(page.getByTestId('transfer-card-2')).toContainText('Changed remotely');
  await openEditor(page);
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Changed remotely');
});

test('supports keyboard entry and keeps month swipes on transfer cards', async ({ page }) => {
  await setup(page);
  const button = page.getByTestId('transfer-card-2').getByRole('button');
  await button.focus();
  await button.press('Enter');
  await expect(page.getByTestId('edit-transfer-form')).toBeVisible();
  await page.getByTestId('edit-transfer-close').click();
  await button.evaluate((target) => {
    const dispatch = (type: string, x: number) => {
      const touch = { clientX: x, clientY: 300 };
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', {
        value: { 0: touch, item: () => (type === 'touchend' ? null : touch) },
      });
      Object.defineProperty(event, 'changedTouches', { value: { 0: touch, item: () => touch } });
      target.dispatchEvent(event);
    };
    dispatch('touchstart', 300);
    dispatch('touchmove', 100);
    dispatch('touchend', 100);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    '2024-05',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('keeps the original hidden account selectable when editing historical transfers', async ({
  page,
}) => {
  const sql = await initSqlJs({
    locateFile: (file) => path.resolve('node_modules/sql.js/dist', file),
  });
  const db = new sql.Database(new Uint8Array(fixtureBytes));
  db.exec('UPDATE transfer SET from_account = 7 WHERE transfer_id = 2;');
  const bytes = Array.from(db.export());
  db.close();
  await setup(page, false, bytes);
  await openEditor(page);
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('7');
  await page.getByTestId('add-transfer-name').fill('Historical edit');
  await page.getByTestId('edit-transfer-submit').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('transfer-card-2')).toContainText('Historical edit');
  const saved = await uploadedDb(page);
  expect(
    saved.exec('SELECT from_account FROM transfer WHERE transfer_id = 2;')[0]?.values[0],
  ).toEqual([7]);
  saved.close();
});

test('keeps footer close and header delete disabled during upload', async ({ page }) => {
  await setup(page, false, fixtureBytes, 2500);
  await openEditor(page);
  await page.getByTestId('add-transfer-name').fill('Saving edit');
  await page.getByTestId('edit-transfer-submit').click();
  await expect(page.getByTestId('edit-transfer-close')).toBeDisabled();
  await expect(page.getByTestId('edit-transfer-delete')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('transfer-card-2')).toContainText('Saving edit');
});
