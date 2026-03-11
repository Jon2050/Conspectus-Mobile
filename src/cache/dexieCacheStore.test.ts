// Verifies the Dexie cache store persists full DB snapshots and keeps reset-safe IndexedDB lifecycle behavior.
import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDexieCacheStore } from './index';

import type { CachedDatabaseSnapshot, CachedFileBinding } from './index';

const STORE_SCHEMAS = {
  databaseSnapshots: '[driveId+itemId], driveId, itemId',
  syncMetadata: '[driveId+itemId], driveId, itemId, eTag, lastSyncAtIso',
};

const createSnapshot = (
  overrides: Partial<CachedDatabaseSnapshot> = {},
): CachedDatabaseSnapshot => ({
  binding: {
    driveId: 'drive-123',
    itemId: 'item-456',
    name: 'Conspectus.db',
    parentPath: '/Finance',
    ...(overrides.binding ?? {}),
  },
  metadata: {
    eTag: '"etag-1"',
    lastSyncAtIso: '2026-03-11T09:30:00.000Z',
    ...(overrides.metadata ?? {}),
  },
  dbBytes: overrides.dbBytes ?? new Uint8Array([1, 2, 3, 4]),
});

const deleteDatabase = async (databaseName: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${databaseName}.`));
    request.onblocked = () => reject(new Error(`Deleting ${databaseName} was blocked.`));
  });
};

describe('dexie cache store', () => {
  let databaseName: string;
  let cacheStore: ReturnType<typeof createDexieCacheStore>;

  beforeEach(() => {
    databaseName = `conspectus-mobile-cache-test-${crypto.randomUUID()}`;
    cacheStore = createDexieCacheStore({ databaseName });
  });

  afterEach(async () => {
    cacheStore.closeConnections();
    await deleteDatabase(databaseName);
  });

  it('writes and reads a complete cached snapshot', async () => {
    const snapshot = createSnapshot();

    await cacheStore.writeSnapshot(snapshot);

    await expect(cacheStore.readSnapshot(snapshot.binding)).resolves.toEqual(snapshot);
  });

  it('returns null when the binding has no cached snapshot', async () => {
    const binding: CachedFileBinding = {
      driveId: 'drive-unknown',
      itemId: 'item-missing',
      name: 'Missing.db',
      parentPath: '/Missing',
    };

    await expect(cacheStore.readSnapshot(binding)).resolves.toBeNull();
  });

  it('overwrites an existing snapshot for the same binding', async () => {
    const binding = createSnapshot().binding;
    const initialSnapshot = createSnapshot();
    const updatedSnapshot = createSnapshot({
      binding,
      metadata: {
        eTag: '"etag-2"',
        lastSyncAtIso: '2026-03-11T10:45:00.000Z',
      },
      dbBytes: new Uint8Array([9, 8, 7]),
    });

    await cacheStore.writeSnapshot(initialSnapshot);
    await cacheStore.writeSnapshot(updatedSnapshot);

    await expect(cacheStore.readSnapshot(binding)).resolves.toEqual(updatedSnapshot);
  });

  it('clears only the targeted snapshot binding', async () => {
    const retainedSnapshot = createSnapshot({
      binding: {
        driveId: 'drive-123',
        itemId: 'item-999',
        name: 'Retained.db',
        parentPath: '/Archive',
      },
    });
    const clearedSnapshot = createSnapshot();

    await cacheStore.writeSnapshot(clearedSnapshot);
    await cacheStore.writeSnapshot(retainedSnapshot);

    await cacheStore.clearSnapshot(clearedSnapshot.binding);

    await expect(cacheStore.readSnapshot(clearedSnapshot.binding)).resolves.toBeNull();
    await expect(cacheStore.readSnapshot(retainedSnapshot.binding)).resolves.toEqual(
      retainedSnapshot,
    );
  });

  it('clears all cached data and remains reusable afterwards', async () => {
    const snapshot = createSnapshot();

    await cacheStore.writeSnapshot(snapshot);
    await cacheStore.clearAll();

    await expect(cacheStore.readSnapshot(snapshot.binding)).resolves.toBeNull();

    const rewrittenSnapshot = createSnapshot({
      metadata: {
        eTag: '"etag-3"',
        lastSyncAtIso: '2026-03-11T12:00:00.000Z',
      },
      dbBytes: new Uint8Array([5, 5, 5]),
    });

    await cacheStore.writeSnapshot(rewrittenSnapshot);
    await expect(cacheStore.readSnapshot(rewrittenSnapshot.binding)).resolves.toEqual(
      rewrittenSnapshot,
    );
  });

  it('does not return a partial snapshot when metadata exists without DB bytes', async () => {
    const snapshot = createSnapshot();
    const rawDatabase = new Dexie(databaseName);
    rawDatabase.version(1).stores(STORE_SCHEMAS);
    await rawDatabase.open();
    await rawDatabase.table('syncMetadata').put({
      driveId: snapshot.binding.driveId,
      itemId: snapshot.binding.itemId,
      name: snapshot.binding.name,
      parentPath: snapshot.binding.parentPath,
      eTag: snapshot.metadata.eTag,
      lastSyncAtIso: snapshot.metadata.lastSyncAtIso,
    });
    rawDatabase.close();

    await expect(cacheStore.readSnapshot(snapshot.binding)).resolves.toBeNull();
  });

  it('creates the version 1 schema with separate snapshot and metadata stores', async () => {
    const snapshot = createSnapshot();

    await cacheStore.writeSnapshot(snapshot);
    cacheStore.closeConnections();

    const rawDatabase = new Dexie(databaseName);
    rawDatabase.version(1).stores(STORE_SCHEMAS);
    await rawDatabase.open();

    expect(rawDatabase.verno).toBe(1);
    expect(Array.from(rawDatabase.tables, (table) => table.name).sort()).toEqual([
      'databaseSnapshots',
      'syncMetadata',
    ]);

    rawDatabase.close();
  });
});
