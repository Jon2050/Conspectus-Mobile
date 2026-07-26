// Verifies token-free resume metadata expiry, validation, and once-per-session redirect claims.
import { describe, expect, it } from 'vitest';

import {
  AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY,
  AUTH_SESSION_RESUME_STORAGE_KEY,
  AUTH_SESSION_RESUME_TTL_MS,
  createAuthSessionResumeStore,
} from './authSessionResumeStore';

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value);
    },
    removeItem: (key: string): void => {
      values.delete(key);
    },
    readRaw: (key: string): string | null => values.get(key) ?? null,
  };
};

describe('auth session resume store', () => {
  it('persists only a normalized account hint for thirty days', () => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    const nowEpochMs = Date.UTC(2026, 6, 26);
    const store = createAuthSessionResumeStore({
      localStorage,
      sessionStorage,
      now: () => nowEpochMs,
    });

    store.save('  home-account  ', '  person@example.com  ');

    expect(store.read()).toEqual({
      homeAccountId: 'home-account',
      loginHint: 'person@example.com',
      expiresAtEpochMs: nowEpochMs + AUTH_SESSION_RESUME_TTL_MS,
    });
    expect(JSON.parse(localStorage.readRaw(AUTH_SESSION_RESUME_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      homeAccountId: 'home-account',
      loginHint: 'person@example.com',
      expiresAtEpochMs: nowEpochMs + AUTH_SESSION_RESUME_TTL_MS,
    });
    expect(localStorage.readRaw(AUTH_SESSION_RESUME_STORAGE_KEY)).not.toContain('accessToken');
    expect(localStorage.readRaw(AUTH_SESSION_RESUME_STORAGE_KEY)).not.toContain('refreshToken');
    expect(localStorage.readRaw(AUTH_SESSION_RESUME_STORAGE_KEY)).not.toContain('idToken');
  });

  it('accepts the record before expiry and removes it at the expiry boundary', () => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    let nowEpochMs = 10_000;
    const store = createAuthSessionResumeStore({
      localStorage,
      sessionStorage,
      now: () => nowEpochMs,
    });

    store.save('home-account', 'person@example.com');
    nowEpochMs += AUTH_SESSION_RESUME_TTL_MS - 1;
    expect(store.read()?.homeAccountId).toBe('home-account');

    nowEpochMs += 1;
    expect(store.read()).toBeNull();
    expect(localStorage.readRaw(AUTH_SESSION_RESUME_STORAGE_KEY)).toBeNull();
  });

  it.each([
    'not-json',
    JSON.stringify({ version: 1 }),
    JSON.stringify({
      version: 1,
      homeAccountId: 'home-account',
      loginHint: ' ',
      expiresAtEpochMs: 20_000,
    }),
    JSON.stringify({
      version: 2,
      homeAccountId: 'home-account',
      loginHint: 'person@example.com',
      expiresAtEpochMs: 20_000,
    }),
  ])('removes malformed resume data', (rawValue) => {
    const localStorage = createMemoryStorage();
    localStorage.setItem(AUTH_SESSION_RESUME_STORAGE_KEY, rawValue);
    const store = createAuthSessionResumeStore({
      localStorage,
      sessionStorage: createMemoryStorage(),
      now: () => 10_000,
    });

    expect(store.read()).toBeNull();
    expect(localStorage.readRaw(AUTH_SESSION_RESUME_STORAGE_KEY)).toBeNull();
  });

  it('claims at most one automatic redirect per browser session', () => {
    const sessionStorage = createMemoryStorage();
    const store = createAuthSessionResumeStore({
      localStorage: createMemoryStorage(),
      sessionStorage,
    });

    expect(store.claimAttempt('home-account', 'session_resume')).toBe(true);
    expect(store.claimAttempt('home-account', 'session_resume')).toBe(false);
    expect(store.claimAttempt('another-account', 'token_recovery')).toBe(false);
    expect(store.readAttempt()).toEqual({
      homeAccountId: 'home-account',
      kind: 'session_resume',
    });

    store.clearAttempt();

    expect(sessionStorage.readRaw(AUTH_SESSION_RESUME_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(store.claimAttempt('another-account', 'token_recovery')).toBe(true);
  });

  it('fails closed when session storage cannot persist the loop guard', () => {
    const store = createAuthSessionResumeStore({
      localStorage: createMemoryStorage(),
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {},
      },
    });

    expect(store.claimAttempt('home-account', 'session_resume')).toBe(false);
  });
});
