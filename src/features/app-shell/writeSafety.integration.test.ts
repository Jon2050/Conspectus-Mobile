// Exercises real SQLite writes against a controllable remote file and a shared browser cache.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  createBrowserDbRuntime,
  createTransferWriteService,
  type BrowserDbRuntime,
  type CreateTransferInput,
} from '@db';
import type { CachedDatabaseSnapshot } from '@cache';
import type { DriveItemBinding, GraphClient } from '@graph';
import { createSyncStateStore } from '@shared';
import {
  createNodeSqlJsRuntimeLoader,
  loadTransferFixtureBytes,
} from '../../shared/testUtils/dbIntegration';
import { createDatabaseSession, type DatabaseIdentity } from './databaseSession';
import { createDatabaseUploadHandoffService } from './databaseUploadHandoffService';
import { createDatabaseConflictRecoveryService } from './databaseConflictRecoveryService';
import { createTransferSaveExportService } from './transferSaveExportService';
import { createAddTransferSaveController } from './routes/addTransferSaveController';
import { createReceiptTransferCommitController } from './receiptTransferCommitController';
import type { AddTransferOptionsState } from './routes/addTransferOptionsController';

const binding: DriveItemBinding = {
  driveId: 'drive',
  itemId: 'file-A',
  name: 'test.db',
  parentPath: '/',
};
const command = (name: string): CreateTransferInput =>
  Object.freeze({
    name,
    bookingDateEpochDay: 20000,
    amountCents: 125,
    transferTypeId: 1,
    fromAccountId: 3,
    toAccountId: 2,
    categoryIds: Object.freeze([1]),
    buyplace: null,
  });
const options: AddTransferOptionsState = {
  operation: 'ready',
  fromAccountOptions: [{ accountId: 3, accountTypeId: 3, name: 'Checking' }],
  toAccountOptions: [{ accountId: 2, accountTypeId: 2, name: 'Spendings' }],
  categoryOptions: [{ categoryId: 1, name: 'Food' }],
  error: null,
};
const fields = (name: string) => ({
  name,
  date: '2024-10-04',
  amount: '1,25�',
  fromAccountId: 3,
  toAccountId: 2,
  category1Id: 1,
  category2Id: -1,
  category3Id: -1,
  buyplace: '',
});
const runtimes: BrowserDbRuntime[] = [];
afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.close());
});
const openRuntime = async (bytes: Uint8Array) => {
  const runtime = createBrowserDbRuntime(createNodeSqlJsRuntimeLoader());
  await runtime.open(bytes);
  runtimes.push(runtime);
  return runtime;
};
const count = (runtime: BrowserDbRuntime, name: string) =>
  runtime.exec('SELECT COUNT(*) FROM transfer WHERE name = ?', [name])[0]?.values[0]?.[0];

const harness = async () => {
  let remoteBytes = loadTransferFixtureBytes();
  let remoteETag = 'v1';
  let cached: CachedDatabaseSnapshot = {
    binding,
    dbBytes: remoteBytes,
    metadata: { eTag: 'v1', lastSyncAtIso: '2026-10-20T00:00:00Z' },
  };
  let identity: DatabaseIdentity | null = { accountId: 'account-A', binding };
  let failUpload = false;
  let failCache = false;
  let acceptThenLoseResponse = false;
  const cache = {
    readSnapshot: vi.fn(async () => cached),
    writeSnapshot: vi.fn(async (snapshot: CachedDatabaseSnapshot) => {
      if (failCache) throw new Error('Injected cache failure');
      cached = snapshot;
    }),
  };
  const graph: Pick<
    GraphClient,
    'uploadFile' | 'getFileMetadata' | 'getFileDownloadUrl' | 'downloadFile'
  > = {
    uploadFile: vi.fn(async (_binding, bytes, expectedETag, _progress, assertContext) => {
      assertContext?.();
      if (failUpload)
        throw Object.assign(new Error('Injected transport failure'), { code: 'network_error' });
      if (expectedETag !== remoteETag)
        throw Object.assign(new Error('Precondition failed'), { code: 'conflict', status: 412 });
      remoteBytes = bytes.slice();
      remoteETag = `v${Number(remoteETag.slice(1)) + 1}`;
      if (acceptThenLoseResponse)
        throw Object.assign(new Error('Response lost after acceptance'), { code: 'network_error' });
      return {
        eTag: remoteETag,
        sizeBytes: bytes.length,
        lastModifiedDateTime: '2026-10-20T00:00:00Z',
      };
    }),
    getFileMetadata: vi.fn(async () => ({
      eTag: remoteETag,
      sizeBytes: remoteBytes.length,
      lastModifiedDateTime: '2026-10-20T00:00:00Z',
    })),
    getFileDownloadUrl: vi.fn(async () => 'https://synthetic.invalid/test.db'),
    downloadFile: vi.fn(async () => remoteBytes.slice()),
  };
  const tab = async () => {
    const runtime = await openRuntime(remoteBytes);
    const sync = createSyncStateStore();
    sync.setSyncing('Verifying');
    sync.setSynced('Verified');
    const session = createDatabaseSession(
      () => runtime,
      () => identity,
      () => get(sync).state === 'synced',
    );
    session.adopt(identity!, remoteETag);
    const uploads = createDatabaseUploadHandoffService(
      graph,
      cache,
      () => identity?.binding ?? null,
      sync,
      { session },
    );
    const service = createTransferSaveExportService(
      createTransferWriteService(runtime),
      runtime,
      uploads,
      session,
    );
    const recovery = createDatabaseConflictRecoveryService(
      graph,
      cache,
      () => identity?.binding ?? null,
      runtime,
      sync,
      { session, snapshotValidator: { validate: async () => {} } },
    );
    const commitIdentity = () => ({
      isAuthenticated: identity !== null,
      isVerifiedCurrent: session.isWritable(),
      contextKey:
        identity === null
          ? null
          : JSON.stringify([identity.accountId, identity.binding.driveId, identity.binding.itemId]),
    });
    const manual = createAddTransferSaveController(
      service,
      { show: vi.fn() },
      recovery,
      commitIdentity,
    );
    const receipt = createReceiptTransferCommitController(service, recovery, { show: vi.fn() });
    return {
      runtime,
      sync,
      session,
      service,
      recovery,
      manual,
      receipt,
      context: () => ({ ...commitIdentity(), isOnline: true, optionsState: options }),
    };
  };
  return {
    tab,
    graph,
    cache,
    setIdentity: (next: DatabaseIdentity | null) => {
      identity = next;
    },
    setUploadFailure: (value: boolean) => {
      failUpload = value;
    },
    setCacheFailure: (value: boolean) => {
      failCache = value;
    },
    loseResponse: () => {
      acceptThenLoseResponse = true;
    },
    advanceCache: () => {
      cached = { ...cached, metadata: { ...cached.metadata, eTag: 'v2' } };
    },
    remoteRuntime: () => openRuntime(remoteBytes),
  };
};
const t = (key: string) => key;

describe('shared write safety with real SQLite', () => {
  it('A1: commits manual and receipt commands through the same session and batch service', async () => {
    const h = await harness();
    const tab = await h.tab();
    await tab.manual.submit(fields('Manual first'), options, t);
    await tab.receipt.commit(
      Object.freeze([command('Receipt second'), command('Receipt third')]),
      tab.context(),
      t,
    );
    expect(tab.receipt.getState()).toMatchObject({ phase: 'saved', createdCount: 2 });
    const remote = await h.remoteRuntime();
    for (const name of ['Manual first', 'Receipt second', 'Receipt third'])
      expect(count(remote, name)).toBe(1);
    expect(remote.exec('PRAGMA foreign_key_check;')).toEqual([]);
    expect(vi.mocked(h.graph.uploadFile).mock.calls.map((call) => call[2])).toEqual(['v1', 'v2']);
  });

  it('D2: checks the target again after awaiting cached metadata', async () => {
    const h = await harness();
    const tab = await h.tab();
    const read = h.cache.readSnapshot.getMockImplementation()!;
    h.cache.readSnapshot.mockImplementationOnce(async () => {
      const snapshot = await read();
      h.setIdentity({ accountId: 'account-B', binding: { ...binding, itemId: 'file-B' } });
      return snapshot;
    });
    await tab.manual.submit(fields('Changed during cache read'), options, t);
    expect(h.graph.uploadFile).not.toHaveBeenCalled();
    expect(tab.manual.getState().canRetry).toBe(false);
  });
  it('D1: never combines retained manual bytes with a newer cache eTag', async () => {
    const h = await harness();
    const tab = await h.tab();
    h.setUploadFailure(true);
    await tab.manual.submit(fields('Original manual'), options, t);
    expect(tab.manual.getState().canRetry).toBe(true);
    h.advanceCache();
    h.setUploadFailure(false);
    await tab.manual.retry(t);
    expect(h.graph.uploadFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(h.graph.uploadFile).mock.calls[0]?.[2]).toBe('v1');
    expect(count(await h.remoteRuntime(), 'Original manual')).toBe(0);
  });
  it.each(['file', 'drive', 'account', 'signout', 'reset'] as const)(
    'D2/D6: invalidates pending bytes after %s change',
    async (kind) => {
      const h = await harness();
      const tab = await h.tab();
      h.setUploadFailure(true);
      await tab.manual.submit(fields('File A only'), options, t);
      if (kind === 'reset') tab.session.invalidate();
      else
        h.setIdentity(
          kind === 'signout'
            ? null
            : {
                accountId: kind === 'account' ? 'account-B' : 'account-A',
                binding: {
                  ...binding,
                  itemId: kind === 'file' ? 'file-B' : binding.itemId,
                  driveId: kind === 'drive' ? 'drive-B' : binding.driveId,
                },
              },
        );
      h.setUploadFailure(false);
      await tab.manual.retry(t);
      expect(h.graph.uploadFile).toHaveBeenCalledTimes(1);
      expect(tab.manual.getState().canRetry).toBe(false);
      expect(count(await h.remoteRuntime(), 'File A only')).toBe(0);
    },
  );
  it('D4: restores authoritative bytes after manual commit/export failure before another submit', async () => {
    const h = await harness();
    const tab = await h.tab();
    vi.spyOn(tab.runtime, 'exportBytes').mockImplementationOnce(() => {
      throw new Error('Export failed');
    });
    await tab.manual.submit(fields('Unreported manual'), options, t);
    expect(count(tab.runtime, 'Unreported manual')).toBe(0);
    expect(h.graph.uploadFile).not.toHaveBeenCalled();
    await tab.manual.submit(fields('Unreported manual'), options, t);
    expect(tab.manual.getState().phase).toBe('saved');
    expect(count(await h.remoteRuntime(), 'Unreported manual')).toBe(1);
  });
  it('D4: blocks both producers when authoritative export recovery also fails', async () => {
    const h = await harness();
    const tab = await h.tab();
    vi.spyOn(tab.runtime, 'exportBytes').mockImplementationOnce(() => {
      throw new Error('Export failed');
    });
    vi.mocked(h.graph.downloadFile).mockRejectedValueOnce(new Error('Recovery failed'));
    await tab.manual.submit(fields('Unreported manual'), options, t);
    expect(tab.manual.getState().phase).toBe('local_commit_recovery_failed');
    await tab.manual.submit(fields('Unreported manual'), options, t);
    await tab.receipt.commit(Object.freeze([command('Receipt')]), tab.context(), t);
    expect(h.graph.uploadFile).not.toHaveBeenCalled();
    expect(tab.runtime.isOpen()).toBe(false);
    await tab.manual.resolveConflict(t);
    expect(count(tab.runtime, 'Unreported manual')).toBe(0);
  });
  it.each(['first', 'retry'] as const)(
    'D5: reconciles remote acceptance/cache failure on %s attempt without another PUT',
    async (attempt) => {
      const h = await harness();
      const tab = await h.tab();
      if (attempt === 'retry') {
        h.setUploadFailure(true);
        await tab.manual.submit(fields('Remote accepted'), options, t);
        h.setUploadFailure(false);
      }
      h.setCacheFailure(true);
      if (attempt === 'first') await tab.manual.submit(fields('Remote accepted'), options, t);
      else await tab.manual.retry(t);
      expect(tab.manual.getState()).toMatchObject({
        phase: 'remote_commit_recovery_failed',
        canRetry: false,
      });
      const attempts = vi.mocked(h.graph.uploadFile).mock.calls.length;
      await tab.manual.retry(t);
      await tab.manual.submit(fields('Remote accepted'), options, t);
      expect(h.graph.uploadFile).toHaveBeenCalledTimes(attempts);
      expect(count(await h.remoteRuntime(), 'Remote accepted')).toBe(1);
    },
  );
  it('distinguishes an unknown outcome and never replays SQL after a lost acceptance response', async () => {
    const h = await harness();
    const tab = await h.tab();
    h.loseResponse();
    await tab.manual.submit(fields('Lost acknowledgement'), options, t);
    expect(tab.manual.getState().errorMessage).toContain('remote_outcome_unknown');
    await tab.manual.retry(t);
    expect(tab.manual.getState().canRetry).toBe(false);
    expect(count(await h.remoteRuntime(), 'Lost acknowledgement')).toBe(1);
    expect(count(tab.runtime, 'Lost acknowledgement')).toBe(1);
  });
  it('D6: two tabs keep their own basis even though they share the updated cache', async () => {
    const h = await harness();
    const a = await h.tab();
    const b = await h.tab();
    await a.manual.submit(fields('Tab A transfer'), options, t);
    await b.manual.submit(fields('Stale tab B transfer'), options, t);
    expect(h.graph.uploadFile).toHaveBeenCalledTimes(1);
    const remote = await h.remoteRuntime();
    expect(count(remote, 'Tab A transfer')).toBe(1);
    expect(count(remote, 'Stale tab B transfer')).toBe(0);
  });
  it('D6: server If-Match also protects two tabs when their shared metadata is stale', async () => {
    const h = await harness();
    const a = await h.tab();
    const b = await h.tab();
    const oldSnapshot = await h.cache.readSnapshot();
    await a.manual.submit(fields('Server accepted A'), options, t);
    h.cache.readSnapshot.mockResolvedValue(oldSnapshot);
    await b.manual.submit(fields('Server rejects B'), options, t);
    expect(h.graph.uploadFile).toHaveBeenCalledTimes(2);
    expect(vi.mocked(h.graph.uploadFile).mock.calls.map((call) => call[2])).toEqual(['v1', 'v1']);
    const remote = await h.remoteRuntime();
    expect(count(remote, 'Server accepted A')).toBe(1);
    expect(count(remote, 'Server rejects B')).toBe(0);
  });
  it('D6: replacing the runtime without adopting new provenance cannot authorize a write', async () => {
    const h = await harness();
    const tab = await h.tab();
    tab.runtime.close();
    await tab.runtime.open(loadTransferFixtureBytes());
    await tab.manual.submit(fields('Wrong generation'), options, t);
    expect(h.graph.uploadFile).not.toHaveBeenCalled();
    expect(count(tab.runtime, 'Wrong generation')).toBe(0);
  });
  it('D6: a refresh in progress or failed replacement cannot authorize writes on the old runtime', async () => {
    const h = await harness();
    const tab = await h.tab();
    tab.session.beginRefresh();
    await tab.manual.submit(fields('During refresh'), options, t);
    await expect(tab.runtime.open(Uint8Array.of(1, 2))).rejects.toThrow();
    await tab.manual.submit(fields('After failed open'), options, t);
    expect(h.graph.uploadFile).not.toHaveBeenCalled();
    expect(count(tab.runtime, 'During refresh')).toBe(0);
    expect(count(tab.runtime, 'After failed open')).toBe(0);
  });
  it('D6/A1: an active manual upload excludes refresh and a receipt write until it finishes', async () => {
    const h = await harness();
    const tab = await h.tab();
    const upload = vi.mocked(h.graph.uploadFile).getMockImplementation()!;
    let release!: () => void;
    vi.mocked(h.graph.uploadFile).mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return upload(...args);
    });
    const saving = tab.manual.submit(fields('Manual in flight'), options, t);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(tab.session.beginRefresh()).toBeNull();
    await tab.receipt.commit(Object.freeze([command('Competing receipt')]), tab.context(), t);
    expect(count(tab.runtime, 'Competing receipt')).toBe(0);
    release();
    await saving;
    expect(count(tab.runtime, 'Manual in flight')).toBe(1);
  });

  it('Q3: retries an actual receipt batch byte-for-byte without repeating SQL or balance changes', async () => {
    const h = await harness();
    const tab = await h.tab();
    const commands = Object.freeze([command('Receipt bread'), command('Receipt soap')]);
    h.setUploadFailure(true);
    await tab.receipt.commit(commands, tab.context(), t);
    expect(tab.receipt.getState().phase).toBe('upload_failed');
    const balancesAfterCommit = tab.runtime.exec(
      'SELECT account_id, amount FROM account ORDER BY account_id',
    );
    const firstUpload = vi.mocked(h.graph.uploadFile).mock.calls[0]!;
    h.setUploadFailure(false);
    await tab.receipt.retryUpload(tab.context(), t);
    expect(tab.receipt.getState()).toMatchObject({ phase: 'saved', createdCount: 2 });
    const secondUpload = vi.mocked(h.graph.uploadFile).mock.calls[1]!;
    expect(secondUpload[1]).toEqual(firstUpload[1]);
    expect(secondUpload[2]).toBe('v1');
    const remote = await h.remoteRuntime();
    for (const input of commands) expect(count(remote, input.name)).toBe(1);
    expect(remote.exec('SELECT account_id, amount FROM account ORDER BY account_id')).toEqual(
      balancesAfterCommit,
    );
    expect(remote.exec('PRAGMA foreign_key_check')).toEqual([]);
  });

  it.each(['cache_version', 'binding'] as const)(
    'Q3: a retained receipt batch cannot cross a changed %s boundary',
    async (change) => {
      const h = await harness();
      const tab = await h.tab();
      h.setUploadFailure(true);
      await tab.receipt.commit(Object.freeze([command('Retained receipt')]), tab.context(), t);
      expect(tab.receipt.getState().phase).toBe('upload_failed');
      if (change === 'cache_version') h.advanceCache();
      else h.setIdentity({ accountId: 'account-A', binding: { ...binding, itemId: 'file-B' } });
      h.setUploadFailure(false);
      await tab.receipt.retryUpload(tab.context(), t);
      expect(h.graph.uploadFile).toHaveBeenCalledTimes(1);
      expect(tab.receipt.getState().phase).not.toBe('upload_failed');
      expect(count(await h.remoteRuntime(), 'Retained receipt')).toBe(0);
    },
  );

  it('Q3: receipt export failure restores real authoritative bytes before an explicit new save', async () => {
    const h = await harness();
    const tab = await h.tab();
    const commands = Object.freeze([command('Receipt after export failure')]);
    vi.spyOn(tab.runtime, 'exportBytes').mockImplementationOnce(() => {
      throw new Error('Injected receipt export failure');
    });
    await tab.receipt.commit(commands, tab.context(), t);
    expect(h.graph.uploadFile).not.toHaveBeenCalled();
    expect(count(tab.runtime, commands[0]!.name)).toBe(0);
    tab.receipt.reset();
    await tab.receipt.commit(commands, tab.context(), t);
    expect(tab.receipt.getState().phase).toBe('saved');
    expect(count(await h.remoteRuntime(), commands[0]!.name)).toBe(1);
  });

  it.each(['first', 'retry'] as const)(
    'Q3: a receipt accepted remotely on %s with failed cache reconciles without another PUT',
    async (attempt) => {
      const h = await harness();
      const tab = await h.tab();
      const commands = Object.freeze([command('Remote receipt')]);
      if (attempt === 'retry') {
        h.setUploadFailure(true);
        await tab.receipt.commit(commands, tab.context(), t);
        h.setUploadFailure(false);
      }
      h.setCacheFailure(true);
      if (attempt === 'first') await tab.receipt.commit(commands, tab.context(), t);
      else await tab.receipt.retryUpload(tab.context(), t);
      expect(tab.receipt.getState()).toMatchObject({
        phase: 'remote_commit_recovery_failed',
      });
      const uploads = vi.mocked(h.graph.uploadFile).mock.calls.length;
      await tab.receipt.retryUpload(tab.context(), t);
      await tab.receipt.commit(commands, tab.context(), t);
      expect(h.graph.uploadFile).toHaveBeenCalledTimes(uploads);
      h.setCacheFailure(false);
      await tab.recovery.syncLatestDatabase();
      expect(count(tab.runtime, 'Remote receipt')).toBe(1);
      expect(count(await h.remoteRuntime(), 'Remote receipt')).toBe(1);
      expect(h.graph.uploadFile).toHaveBeenCalledTimes(uploads);
    },
  );
});
