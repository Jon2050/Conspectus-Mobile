// Resolves the production SQLite snapshot validator and localhost test overrides.
import {
  createSqliteSnapshotValidator,
  type CachedDatabaseSnapshotValidator,
} from './cachedDatabaseSnapshotService';

declare global {
  interface Window {
    __CONSPECTUS_APP_SNAPSHOT_VALIDATOR__?: CachedDatabaseSnapshotValidator;
  }
}

const isLocalSnapshotValidatorMockHost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
};

const isSnapshotValidator = (value: unknown): value is CachedDatabaseSnapshotValidator => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return typeof (value as Partial<CachedDatabaseSnapshotValidator>).validate === 'function';
};

export const resolveAppSnapshotValidator = (): CachedDatabaseSnapshotValidator => {
  if (
    isLocalSnapshotValidatorMockHost() &&
    isSnapshotValidator(window.__CONSPECTUS_APP_SNAPSHOT_VALIDATOR__)
  ) {
    return window.__CONSPECTUS_APP_SNAPSHOT_VALIDATOR__;
  }

  return createSqliteSnapshotValidator();
};
