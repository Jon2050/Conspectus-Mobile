// Owns refresh concurrency and runtime adoption; the shell only supplies UI/lifecycle callbacks.
import type { BrowserDbRuntime } from '@db';
import type { DriveItemBinding } from '@graph';
import type { DatabaseSession } from './databaseSession';
import { sameDatabaseIdentity } from './databaseSession';
import type {
  StartupFreshnessDecision,
  StartupFreshnessMode,
  StartupFreshnessService,
} from './startupFreshnessService';
import { syncDbRuntimeForStartupDecision } from './startupDbRuntimeSync';

interface RefreshOptions {
  readonly session: DatabaseSession;
  readonly runtime: () => BrowserDbRuntime;
  readonly freshness: () => StartupFreshnessService;
  readonly isOnline: () => boolean;
  readonly onStart: () => void;
  readonly onProgress: (loaded: number, total: number | null) => void;
  readonly onDecision: (decision: StartupFreshnessDecision) => void;
  readonly onError: (error: unknown) => void;
  readonly onReplace: () => void;
  readonly onRecoveredBinding: (binding: DriveItemBinding) => void;
}

export const createDatabaseRefreshController = (options: RefreshOptions) => {
  const { session } = options;
  let active: {
    key: string;
    mode: StartupFreshnessMode;
    abort: AbortController;
    promise: Promise<void>;
  } | null = null;
  let disposed = false;
  let queued: {
    key: string;
    binding: DriveItemBinding | null;
    mode: StartupFreshnessMode;
    promise: Promise<void>;
    complete: () => void;
  } | null = null;
  const cancel = () => {
    active?.abort.abort();
    active = null;
    queued?.complete();
    queued = null;
  };
  const unsubscribe = session.subscribeIdle(() => {
    const next = queued;
    queued = null;
    if (next !== null && !disposed) void refresh(next.binding, next.mode).finally(next.complete);
  });

  const refresh = (
    binding: DriveItemBinding | null,
    mode: StartupFreshnessMode = 'reuse_if_current',
  ): Promise<void> => {
    if (disposed) return Promise.resolve();
    const identity = session.identity();
    const key = JSON.stringify([identity?.accountId, binding?.driveId, binding?.itemId]);
    if (active?.key === key && (mode === 'reuse_if_current' || active.mode === mode))
      return active.promise;
    if (queued?.key === key) {
      if (mode === 'force_download') queued.mode = mode;
      return queued.promise;
    }
    cancel();
    if (session.isBusy()) {
      let complete = () => {};
      const promise = new Promise<void>((resolve) => {
        complete = resolve;
      });
      queued = { key, binding, mode, promise, complete };
      return promise;
    }
    const token = session.beginRefresh();
    if (token === null) return Promise.resolve();
    const abort = new AbortController();
    const sessionSignal = session.refreshSignal();
    const abortFromSession = () => abort.abort();
    sessionSignal.addEventListener('abort', abortFromSession, { once: true });
    const current = () =>
      !disposed &&
      !abort.signal.aborted &&
      session.isGeneration(token) &&
      (identity === null
        ? session.identity() === null
        : sameDatabaseIdentity(identity, session.identity()));
    const promise = (async () => {
      options.onStart();
      try {
        const activeSnapshot = session.activeSnapshot();
        const decision = await options.freshness().resolve(
          binding,
          options.isOnline(),
          (loaded, total) => {
            if (current()) options.onProgress(loaded, total);
          },
          mode,
          { signal: abort.signal, ...(activeSnapshot === undefined ? {} : { activeSnapshot }) },
        );
        if (!current()) return;
        if (decision.kind !== 'ready' || !decision.reuseRuntime) options.onReplace();
        if (
          (await syncDbRuntimeForStartupDecision(options.runtime(), decision, current)) ===
          'superseded'
        )
          return;
        if (!current()) return;
        if (decision.kind === 'ready') {
          if (decision.recoveredBinding !== undefined)
            options.onRecoveredBinding(decision.recoveredBinding);
          if (identity !== null)
            session.adopt(
              { ...identity, binding: decision.snapshot.binding },
              decision.snapshot.metadata.eTag,
            );
        } else session.invalidate();
        options.onDecision(decision);
      } catch (error) {
        if (!current()) return;
        session.invalidate();
        options.runtime().close();
        options.onError(error);
      }
    })().finally(() => {
      sessionSignal.removeEventListener('abort', abortFromSession);
      if (active?.abort === abort) active = null;
    });
    active = { key, mode, abort, promise };
    return promise;
  };
  return {
    refresh,
    cancel,
    dispose: () => {
      disposed = true;
      cancel();
      unsubscribe();
    },
  };
};
