// Persists token-free account hints and guards automatic Microsoft session restoration redirects.
export const AUTH_SESSION_RESUME_STORAGE_KEY = 'conspectus.authSessionResume';
export const AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY = 'conspectus.authSessionResumeAttempt';
export const AUTH_SESSION_RESUME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const RESUME_RECORD_VERSION = 1;
const RESUME_ATTEMPT_VERSION = 1;

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type AuthSessionResumeAttemptKind = 'session_resume' | 'token_recovery';

export interface AuthSessionResumeRecord {
  readonly homeAccountId: string;
  readonly loginHint: string;
  readonly expiresAtEpochMs: number;
}

export interface AuthSessionResumeAttempt {
  readonly homeAccountId: string;
  readonly kind: AuthSessionResumeAttemptKind;
}

export interface AuthSessionResumeStore {
  read(): AuthSessionResumeRecord | null;
  save(homeAccountId: string, loginHint: string): void;
  clear(): void;
  readAttempt(): AuthSessionResumeAttempt | null;
  claimAttempt(homeAccountId: string, kind: AuthSessionResumeAttemptKind): boolean;
  clearAttempt(): void;
}

interface CreateAuthSessionResumeStoreOptions {
  readonly localStorage?: StorageAdapter | null;
  readonly sessionStorage?: StorageAdapter | null;
  readonly now?: () => number;
}

interface PersistedResumeRecord {
  readonly version: typeof RESUME_RECORD_VERSION;
  readonly homeAccountId: string;
  readonly loginHint: string;
  readonly expiresAtEpochMs: number;
}

interface PersistedResumeAttempt {
  readonly version: typeof RESUME_ATTEMPT_VERSION;
  readonly homeAccountId: string;
  readonly kind: AuthSessionResumeAttemptKind;
}

const normalizeNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseResumeRecord = (value: unknown, nowEpochMs: number): AuthSessionResumeRecord | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Partial<PersistedResumeRecord>;
  const homeAccountId = normalizeNonEmptyString(candidate.homeAccountId);
  const loginHint = normalizeNonEmptyString(candidate.loginHint);
  if (
    candidate.version !== RESUME_RECORD_VERSION ||
    homeAccountId === null ||
    loginHint === null ||
    typeof candidate.expiresAtEpochMs !== 'number' ||
    !Number.isFinite(candidate.expiresAtEpochMs) ||
    candidate.expiresAtEpochMs <= nowEpochMs
  ) {
    return null;
  }

  return {
    homeAccountId,
    loginHint,
    expiresAtEpochMs: candidate.expiresAtEpochMs,
  };
};

const parseResumeAttempt = (value: unknown): AuthSessionResumeAttempt | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Partial<PersistedResumeAttempt>;
  const homeAccountId = normalizeNonEmptyString(candidate.homeAccountId);
  if (
    candidate.version !== RESUME_ATTEMPT_VERSION ||
    homeAccountId === null ||
    (candidate.kind !== 'session_resume' && candidate.kind !== 'token_recovery')
  ) {
    return null;
  }

  return {
    homeAccountId,
    kind: candidate.kind,
  };
};

const readJson = (storage: StorageAdapter | null, key: string): unknown => {
  if (storage === null) {
    return null;
  }

  try {
    const rawValue = storage.getItem(key);
    return rawValue === null ? null : JSON.parse(rawValue);
  } catch {
    return null;
  }
};

const removeItem = (storage: StorageAdapter | null, key: string): void => {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage failures must not break the authentication flow.
  }
};

const resolveStorage = (name: 'localStorage' | 'sessionStorage'): StorageAdapter | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window[name];
  } catch {
    return null;
  }
};

export const createAuthSessionResumeStore = (
  options: CreateAuthSessionResumeStoreOptions = {},
): AuthSessionResumeStore => {
  const localStorage =
    options.localStorage === undefined ? resolveStorage('localStorage') : options.localStorage;
  const sessionStorage =
    options.sessionStorage === undefined
      ? resolveStorage('sessionStorage')
      : options.sessionStorage;
  const now = options.now ?? Date.now;

  return {
    read(): AuthSessionResumeRecord | null {
      const record = parseResumeRecord(
        readJson(localStorage, AUTH_SESSION_RESUME_STORAGE_KEY),
        now(),
      );
      if (record === null) {
        removeItem(localStorage, AUTH_SESSION_RESUME_STORAGE_KEY);
      }
      return record;
    },

    save(homeAccountId: string, loginHint: string): void {
      const normalizedHomeAccountId = normalizeNonEmptyString(homeAccountId);
      const normalizedLoginHint = normalizeNonEmptyString(loginHint);
      if (
        localStorage === null ||
        normalizedHomeAccountId === null ||
        normalizedLoginHint === null
      ) {
        return;
      }

      const payload: PersistedResumeRecord = {
        version: RESUME_RECORD_VERSION,
        homeAccountId: normalizedHomeAccountId,
        loginHint: normalizedLoginHint,
        expiresAtEpochMs: now() + AUTH_SESSION_RESUME_TTL_MS,
      };

      try {
        localStorage.setItem(AUTH_SESSION_RESUME_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Authentication remains usable without automatic cross-session restoration.
      }
    },

    clear(): void {
      removeItem(localStorage, AUTH_SESSION_RESUME_STORAGE_KEY);
    },

    readAttempt(): AuthSessionResumeAttempt | null {
      const attempt = parseResumeAttempt(
        readJson(sessionStorage, AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY),
      );
      if (attempt === null) {
        removeItem(sessionStorage, AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY);
      }
      return attempt;
    },

    claimAttempt(homeAccountId: string, kind: AuthSessionResumeAttemptKind): boolean {
      const normalizedHomeAccountId = normalizeNonEmptyString(homeAccountId);
      if (
        sessionStorage === null ||
        normalizedHomeAccountId === null ||
        this.readAttempt() !== null
      ) {
        return false;
      }

      const payload: PersistedResumeAttempt = {
        version: RESUME_ATTEMPT_VERSION,
        homeAccountId: normalizedHomeAccountId,
        kind,
      };

      try {
        sessionStorage.setItem(AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY, JSON.stringify(payload));
        const claimedAttempt = this.readAttempt();
        return (
          claimedAttempt?.homeAccountId === normalizedHomeAccountId && claimedAttempt.kind === kind
        );
      } catch {
        removeItem(sessionStorage, AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY);
        return false;
      }
    },

    clearAttempt(): void {
      removeItem(sessionStorage, AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY);
    },
  };
};
