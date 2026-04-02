// Applies startup freshness outcomes to the app sync-state store and surfaces background feedback via toasts.
import { isDbRuntimeError, type DbRuntimeErrorCode } from '@db';
import { appToastStore, type SyncStateStore, type ToastType } from '@shared';

import type { StartupFreshnessDecision } from './startupFreshnessService';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

interface ToastStoreLike {
  show(message: string, type?: ToastType, durationMs?: number): string;
}

const STARTUP_SYNCING_MESSAGE = 'sync.startup.checking';
const STARTUP_SYNCING_TOAST_MESSAGE = 'sync.startup.toastSyncing';
const STARTUP_DB_RUNTIME_FAILURE_BRANCH = 'db_runtime_open_failed';

const STARTUP_DB_RUNTIME_FAILURE_MESSAGES: Record<DbRuntimeErrorCode, string> = {
  db_runtime_init_failed: 'sync.dbRuntimeError.initFailed',
  db_open_failed: 'sync.dbRuntimeError.openFailed',
  db_pragma_failed: 'sync.dbRuntimeError.pragmaFailed',
  db_not_open: 'sync.dbRuntimeError.notOpen',
  db_query_failed: 'sync.dbRuntimeError.queryFailed',
  db_export_failed: 'sync.dbRuntimeError.exportFailed',
};

const buildCachedFallbackMessage = (failure: StartupFreshnessDecision['failure']): string =>
  failure === null
    ? get(_)('sync.startup.cachedFallback')
    : get(_)('sync.startup.cachedFallbackPrefix', { values: { message: failure.message } });

const buildStartupSyncMessage = (decision: StartupFreshnessDecision): string | null => {
  switch (decision.branch) {
    case 'no_binding':
      return null;
    case 'online_unchanged':
      return get(_)('sync.startup.onlineUnchanged');
    case 'online_changed':
      return get(_)('sync.startup.onlineChanged');
    case 'offline_cached':
      return get(_)('sync.startup.offlineCached');
    case 'online_auth_expired_cached':
    case 'online_metadata_failed_cached':
    case 'online_download_failed_cached':
      return buildCachedFallbackMessage(decision.failure);
    case 'online_auth_expired':
    case 'offline_missing_cache':
    case 'online_metadata_failed':
    case 'online_download_failed':
      return decision.failure.message;
  }
};

const showDecisionToast = (
  toastStore: ToastStoreLike,
  decision: StartupFreshnessDecision,
  message: string | null,
): void => {
  if (message === null) {
    return;
  }

  switch (decision.branch) {
    case 'online_changed':
      toastStore.show(message, 'success', 3200);
      return;
    case 'online_auth_expired_cached':
    case 'online_metadata_failed_cached':
    case 'online_download_failed_cached':
      toastStore.show(message, 'warning', 4200);
      return;
    case 'online_auth_expired':
    case 'online_metadata_failed':
    case 'online_download_failed':
      toastStore.show(message, 'error', 5000);
      return;
    default:
      return;
  }
};

export const beginStartupSync = (
  syncStateStore: SyncStateStore,
  toastStore: ToastStoreLike = appToastStore,
): void => {
  syncStateStore.setSyncing(get(_)(STARTUP_SYNCING_MESSAGE));
  toastStore.show(get(_)(STARTUP_SYNCING_TOAST_MESSAGE), 'info', 2800);
};

export const updateStartupSyncProgress = (
  syncStateStore: SyncStateStore,
  loadedBytes: number,
  totalBytes: number | null,
): void => {
  syncStateStore.updateProgress(loadedBytes, totalBytes);
};

export const applyStartupFreshnessDecision = (
  syncStateStore: SyncStateStore,
  decision: StartupFreshnessDecision,
  toastStore: ToastStoreLike = appToastStore,
): void => {
  const message = buildStartupSyncMessage(decision);

  switch (decision.syncState) {
    case 'idle':
      syncStateStore.reset();
      return;
    case 'synced':
      syncStateStore.setSynced(message ?? get(_)('sync.startup.completed'), {
        branch: decision.branch,
      });
      break;
    case 'stale':
      syncStateStore.setStale(message ?? get(_)('sync.startup.stale'), {
        branch: decision.branch,
      });
      break;
    case 'offline':
      syncStateStore.setOffline(message ?? get(_)('sync.startup.offlineActive'), {
        branch: decision.branch,
      });
      break;
    case 'error':
      syncStateStore.setError(message ?? get(_)('sync.startup.failed'), {
        branch: decision.branch,
      });
      break;
  }

  showDecisionToast(toastStore, decision, message);
};

export const applyUnexpectedStartupSyncError = (
  syncStateStore: SyncStateStore,
  message: string,
  toastStore: ToastStoreLike = appToastStore,
): void => {
  syncStateStore.setError(message);
  toastStore.show(message, 'error', 5000);
};

export const applyStartupDbRuntimeError = (
  syncStateStore: SyncStateStore,
  error: unknown,
  toastStore: ToastStoreLike = appToastStore,
): void => {
  const message = get(_)(
    isDbRuntimeError(error)
      ? STARTUP_DB_RUNTIME_FAILURE_MESSAGES[error.code]
      : 'sync.dbRuntimeError.fallback',
  );
  syncStateStore.setError(message, {
    branch: STARTUP_DB_RUNTIME_FAILURE_BRANCH,
  });
  toastStore.show(message, 'error', 5000);
};

export const startupSyncStateController = {
  beginStartupSync,
  updateStartupSyncProgress,
  applyStartupFreshnessDecision,
  applyStartupDbRuntimeError,
  applyUnexpectedStartupSyncError,
};
