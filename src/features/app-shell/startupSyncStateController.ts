// Applies startup freshness outcomes to the app sync-state store and surfaces background feedback via toasts.
import { appToastStore, type SyncStateStore, type ToastType } from '@shared';

import type { StartupFreshnessDecision } from './startupFreshnessService';

interface ToastStoreLike {
  show(message: string, type?: ToastType, durationMs?: number): string;
}

const STARTUP_SYNCING_MESSAGE = 'Checking OneDrive for DB updates...';
const STARTUP_SYNCING_TOAST_MESSAGE = 'Syncing with OneDrive in the background...';

const buildCachedFallbackMessage = (failure: StartupFreshnessDecision['failure']): string =>
  failure === null
    ? 'Using the last cached DB because refreshing from OneDrive failed.'
    : `${failure.message} Using the last cached DB for now.`;

const buildStartupSyncMessage = (decision: StartupFreshnessDecision): string | null => {
  switch (decision.branch) {
    case 'no_binding':
      return null;
    case 'online_unchanged':
      return 'Cached DB is current with OneDrive.';
    case 'online_changed':
      return 'Downloaded the latest DB from OneDrive.';
    case 'offline_cached':
      return 'Offline mode using the last cached DB.';
    case 'online_metadata_failed_cached':
      return buildCachedFallbackMessage(decision.failure);
    case 'online_download_failed_cached':
      return buildCachedFallbackMessage(decision.failure);
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
    case 'online_metadata_failed_cached':
    case 'online_download_failed_cached':
      toastStore.show(message, 'warning', 4200);
      return;
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
  syncStateStore.setSyncing(STARTUP_SYNCING_MESSAGE);
  toastStore.show(STARTUP_SYNCING_TOAST_MESSAGE, 'info', 2800);
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
      syncStateStore.setSynced(message ?? 'DB sync completed.', {
        branch: decision.branch,
      });
      break;
    case 'stale':
      syncStateStore.setStale(message ?? 'Cached DB is stale.', {
        branch: decision.branch,
      });
      break;
    case 'offline':
      syncStateStore.setOffline(message ?? 'Offline mode is active.', {
        branch: decision.branch,
      });
      break;
    case 'error':
      syncStateStore.setError(message ?? 'Startup sync failed.', {
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

export const startupSyncStateController = {
  beginStartupSync,
  applyStartupFreshnessDecision,
  applyUnexpectedStartupSyncError,
};
