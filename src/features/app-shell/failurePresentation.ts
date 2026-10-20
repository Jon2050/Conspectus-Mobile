// Converts diagnostics to stable user-facing classes. Raw provider/SQLite text stays out of UI.
export interface FailurePresentation {
  readonly messageKey: string;
  readonly action: 'sign_in' | 'retry' | 'select_file' | 'reload';
}

export const presentOperationFailure = (error: unknown): FailurePresentation => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'unauthorized':
    case 'auth_expired':
    case 'interaction_required':
    case 'no_active_account':
      return { messageKey: 'sync.failure.auth', action: 'sign_in' };
    case 'forbidden':
    case 'permission_denied':
      return { messageKey: 'sync.failure.permission', action: 'select_file' };
    case 'not_found':
    case 'file_not_found':
    case 'rebind_required':
      return { messageKey: 'sync.startup.fileMissing', action: 'select_file' };
    case 'invalid_selection':
    case 'db_open_failed':
    case 'database_invalid':
      return { messageKey: 'sync.failure.database', action: 'select_file' };
    case 'offline_unsupported':
      return { messageKey: 'sync.failure.offline', action: 'retry' };
    case 'network_error':
    case 'timeout':
    case 'metadata_fetch_failed':
    case 'snapshot_download_failed':
      return { messageKey: 'sync.failure.connection', action: 'retry' };
    case 'cache_unavailable':
      return { messageKey: 'sync.failure.cache', action: 'retry' };
    case 'conflict':
    case 'database_changed':
      return { messageKey: 'sync.failure.changed', action: 'retry' };
    case 'db_query_failed':
      return { messageKey: 'sync.failure.query', action: 'reload' };
    default:
      return { messageKey: 'sync.failure.unexpected', action: 'retry' };
  }
};
