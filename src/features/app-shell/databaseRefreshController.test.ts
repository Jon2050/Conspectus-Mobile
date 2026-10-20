import { describe, expect, it, vi } from 'vitest';
import type { BrowserDbRuntime } from '@db';
import { createDatabaseSession, type DatabaseIdentity } from './databaseSession';
import { createDatabaseRefreshController } from './databaseRefreshController';
import {
  createStartupFreshnessService,
  type StartupFreshnessReadyDecision,
} from './startupFreshnessService';

const binding = { driveId: 'drive', itemId: 'item', name: 'test.db', parentPath: '/' };
const decision: StartupFreshnessReadyDecision = {
  kind: 'ready',
  branch: 'online_unchanged',
  syncState: 'synced',
  failure: null,
  snapshot: { binding, metadata: { eTag: 'v1', lastSyncAtIso: '' }, dbBytes: new Uint8Array([1]) },
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};
const setup = () => {
  let identity: DatabaseIdentity = { accountId: 'account', binding };
  let generation = 1;
  const runtime: BrowserDbRuntime = {
    open: vi.fn(async () => {
      generation++;
    }),
    close: vi.fn(() => {
      generation++;
    }),
    exec: () => [],
    exportBytes: () => new Uint8Array(),
    isOpen: () => true,
    getGeneration: () => generation,
  };
  const session = createDatabaseSession(
    () => runtime,
    () => identity,
    () => true,
  );
  session.adopt(identity, 'v1');
  const graph = {
    getFileMetadata: vi.fn(async () => ({ eTag: 'v1', sizeBytes: 1, lastModifiedDateTime: '' })),
  };
  const cache = { readSnapshot: vi.fn(async () => decision.snapshot) };
  const snapshot = { downloadAndCacheSnapshot: vi.fn(async () => decision.snapshot) };
  const freshness = createStartupFreshnessService(graph, cache, snapshot);
  const callbacks = {
    onStart: vi.fn(),
    onProgress: vi.fn(),
    onDecision: vi.fn(),
    onError: vi.fn(),
    onReplace: vi.fn(),
    onRecoveredBinding: vi.fn(),
  };
  const controller = createDatabaseRefreshController({
    session,
    runtime: () => runtime,
    freshness: () => freshness,
    isOnline: () => true,
    ...callbacks,
  });
  return {
    session,
    runtime,
    graph,
    cache,
    snapshot,
    controller,
    callbacks,
    changeIdentity: () => {
      identity = { ...identity, binding: { ...binding, itemId: 'different' } };
      session.invalidate();
    },
  };
};

describe('database refresh ownership', () => {
  it('coalesces foreground requests, keeps readable data and revokes writes until verification', async () => {
    const fixture = setup();
    const pending = deferred<Awaited<ReturnType<typeof fixture.graph.getFileMetadata>>>();
    fixture.graph.getFileMetadata.mockImplementation(() => pending.promise);
    const first = fixture.controller.refresh(binding);
    expect(fixture.controller.refresh(binding)).toBe(first);
    expect(fixture.session.isReadable()).toBe(true);
    expect(fixture.session.isWritable()).toBe(false);
    pending.resolve({ eTag: 'v1', sizeBytes: 1, lastModifiedDateTime: '' });
    await first;
    expect(fixture.runtime.open).not.toHaveBeenCalled();
    expect(fixture.cache.readSnapshot).not.toHaveBeenCalled();
    expect(fixture.callbacks.onReplace).not.toHaveBeenCalled();
    expect(fixture.session.isWritable()).toBe(true);
    fixture.controller.dispose();
  });
  it('defers and coalesces refresh until an active commit releases the session', async () => {
    const fixture = setup();
    fixture.session.acquire();
    const first = fixture.controller.refresh(binding, 'force_download');
    expect(fixture.controller.refresh(binding)).toBe(first);
    expect(fixture.graph.getFileMetadata).not.toHaveBeenCalled();
    fixture.session.release();
    await first;
    expect(fixture.snapshot.downloadAndCacheSnapshot).toHaveBeenCalledOnce();
    expect(fixture.runtime.open).toHaveBeenCalledOnce();
    fixture.controller.dispose();
  });
  it('aborts superseded transport and never adopts results after an identity change', async () => {
    const fixture = setup();
    const pending = deferred<Awaited<ReturnType<typeof fixture.graph.getFileMetadata>>>();
    fixture.graph.getFileMetadata.mockImplementation(() => pending.promise);
    const first = fixture.controller.refresh(binding);
    fixture.changeIdentity();
    pending.resolve({ eTag: 'v1', sizeBytes: 1, lastModifiedDateTime: '' });
    await first;
    expect(fixture.runtime.open).not.toHaveBeenCalled();
    expect(fixture.callbacks.onDecision).not.toHaveBeenCalled();
    expect(fixture.session.isWritable()).toBe(false);
    fixture.controller.dispose();
  });
  it('does not reuse a locally dirty runtime even when the remote eTag is unchanged', async () => {
    const fixture = setup();
    fixture.session.markDirty();
    await fixture.controller.refresh(binding);
    expect(fixture.runtime.open).toHaveBeenCalledOnce();
    expect(fixture.callbacks.onReplace).toHaveBeenCalledOnce();
    fixture.controller.dispose();
  });
});
