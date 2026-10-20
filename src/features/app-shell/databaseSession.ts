// Binds a writable runtime to the verified account, file and original remote version.
import { get } from 'svelte/store';
import type { BrowserDbRuntime } from '@db';
import type { DriveItemBinding } from '@graph';
import { appNetworkStateStore, appSelectedDriveItemBindingStore, appSyncStateStore } from '@shared';
import { resolveAppAuthClient } from './authClientResolver';
import { resolveAppDbRuntime } from './dbRuntimeResolver';

export interface DatabaseIdentity {
  readonly accountId: string;
  readonly binding: DriveItemBinding;
}

export interface DatabaseWriteContext extends DatabaseIdentity {
  readonly baseETag: string;
  readonly generation: number;
  readonly runtimeGeneration: number | undefined;
}

export const sameDatabaseIdentity = (
  a: DatabaseIdentity | null,
  b: DatabaseIdentity | null,
): boolean =>
  a !== null &&
  b !== null &&
  a.accountId === b.accountId &&
  a.binding.driveId === b.binding.driveId &&
  a.binding.itemId === b.binding.itemId;

export const createDatabaseSession = (
  runtime: () => BrowserDbRuntime,
  identity: () => DatabaseIdentity | null,
  canWrite: () => boolean,
) => {
  let generation = 0;
  let current: DatabaseWriteContext | null = null;
  let busy = false;
  let dirty = false;
  let refreshing = false;
  let refreshAbort = new AbortController();
  const idleListeners = new Set<() => void>();

  const invalidate = (): void => {
    refreshAbort.abort();
    generation += 1;
    current = null;
    refreshing = false;
  };
  const isCurrent = (context: DatabaseWriteContext): boolean =>
    current !== null &&
    context.generation === current.generation &&
    context.baseETag === current.baseETag &&
    sameDatabaseIdentity(context, identity()) &&
    runtime().isOpen() &&
    context.runtimeGeneration === runtime().getGeneration?.();

  return {
    identity,
    isBusy: () => busy,
    hasRuntime: () => current !== null && isCurrent(current),
    isReadable: () => current !== null && !dirty && isCurrent(current),
    activeSnapshot: () =>
      current !== null && !dirty && isCurrent(current)
        ? {
            binding: current.binding,
            metadata: { eTag: current.baseETag, lastSyncAtIso: '' },
          }
        : undefined,
    invalidate,
    refreshSignal: () => refreshAbort.signal,
    beginRefresh(): number | null {
      if (busy) return null;
      refreshAbort.abort();
      refreshAbort = new AbortController();
      refreshing = true;
      return ++generation;
    },
    isGeneration: (token: number) => token === generation,
    adopt(expectedIdentity: DatabaseIdentity, baseETag: string): void {
      if (!sameDatabaseIdentity(expectedIdentity, identity()) || !runtime().isOpen()) {
        invalidate();
        throw new Error('Database identity changed while opening the verified snapshot.');
      }
      current = Object.freeze({
        ...expectedIdentity,
        binding: Object.freeze({ ...expectedIdentity.binding }),
        baseETag,
        generation: ++generation,
        runtimeGeneration: runtime().getGeneration?.(),
      });
      dirty = false;
      refreshing = false;
    },
    isWritable: () =>
      current !== null && !busy && !dirty && !refreshing && canWrite() && isCurrent(current),
    acquire(expected?: DatabaseWriteContext): DatabaseWriteContext {
      const context = expected ?? current;
      if (
        busy ||
        refreshing ||
        context === null ||
        (expected === undefined && !canWrite()) ||
        !isCurrent(context) ||
        (expected === undefined && dirty)
      ) {
        throw new Error('The verified database session is not available for writing.');
      }
      busy = true;
      return context;
    },
    assert(context: DatabaseWriteContext): void {
      if (!isCurrent(context)) throw new Error('The database session changed before upload.');
    },
    markDirty: () => {
      dirty = true;
    },
    accept(context: DatabaseWriteContext, eTag: string): void {
      if (!isCurrent(context)) return;
      current = Object.freeze({ ...context, baseETag: eTag });
      dirty = false;
    },
    subscribeIdle(listener: () => void): () => void {
      idleListeners.add(listener);
      return () => {
        idleListeners.delete(listener);
      };
    },
    release: () => {
      busy = false;
      idleListeners.forEach((listener) => listener());
    },
  };
};

export type DatabaseSession = ReturnType<typeof createDatabaseSession>;

export const appDatabaseSession = createDatabaseSession(
  resolveAppDbRuntime,
  () => {
    const session = resolveAppAuthClient().getSession();
    const binding = get(appSelectedDriveItemBindingStore);
    return !session.isAuthenticated || session.account === null || binding === null
      ? null
      : { accountId: session.account.homeAccountId, binding };
  },
  () => get(appNetworkStateStore) && get(appSyncStateStore).state === 'synced',
);
