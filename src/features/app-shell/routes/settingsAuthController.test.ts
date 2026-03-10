import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, AuthSession } from '@auth';

import { createSettingsAuthController } from './settingsAuthController';

const SIGNED_OUT_SESSION: AuthSession = {
  isAuthenticated: false,
  account: null,
};

const SIGNED_IN_SESSION: AuthSession = {
  isAuthenticated: true,
  account: {
    homeAccountId: 'home-account-id',
    username: 'test-user@example.com',
    displayName: 'Test User',
  },
};

interface MockAuthClientHarness {
  readonly client: AuthClient;
  readonly initialize: ReturnType<typeof vi.fn>;
  readonly signIn: ReturnType<typeof vi.fn>;
  readonly signOut: ReturnType<typeof vi.fn>;
  setSession(session: AuthSession): void;
}

const createDeferred = <T>(): { promise: Promise<T>; resolve(value: T): void } => {
  let resolvePromise: (value: T) => void = () => {};

  return {
    promise: new Promise<T>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: (value: T) => {
      resolvePromise(value);
    },
  };
};

const createMockAuthClientHarness = (): MockAuthClientHarness => {
  let session = SIGNED_OUT_SESSION;

  const initialize = vi.fn(async () => {});
  const signIn = vi.fn(async () => {
    session = SIGNED_IN_SESSION;
  });
  const signOut = vi.fn(async () => {
    session = SIGNED_OUT_SESSION;
  });
  const getAccessToken = vi.fn(async () => 'mock-access-token');

  const client: AuthClient = {
    initialize,
    signIn,
    signOut,
    getAccessToken,
    getSession: () => session,
  };

  return {
    client,
    initialize,
    signIn,
    signOut,
    setSession(nextSession: AuthSession): void {
      session = nextSession;
    },
  };
};

describe('settings auth controller', () => {
  let harness: MockAuthClientHarness;

  beforeEach(() => {
    harness = createMockAuthClientHarness();
  });

  it('loads session during initialization', async () => {
    harness.setSession(SIGNED_IN_SESSION);
    const controller = createSettingsAuthController(harness.client);

    await controller.initialize();

    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
      session: SIGNED_IN_SESSION,
    });
    expect(harness.initialize).toHaveBeenCalledTimes(1);
  });

  it('captures initialization errors and keeps operation idle', async () => {
    const initializeError = new Error('Initialization failed in mock');
    harness.initialize.mockRejectedValueOnce(initializeError);
    const controller = createSettingsAuthController(harness.client);

    await controller.initialize();

    expect(controller.getState().operation).toBe('idle');
    expect(controller.getState().session).toEqual(SIGNED_OUT_SESSION);
    expect(controller.getState().error).toEqual(
      expect.objectContaining({
        code: 'unknown',
        message: 'Initialization failed in mock',
        cause: initializeError,
      }),
    );
  });

  it('initializes automatically before sign-in on a fresh controller', async () => {
    const controller = createSettingsAuthController(harness.client);

    await controller.signIn();

    expect(harness.initialize).toHaveBeenCalledTimes(1);
    expect(harness.signIn).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
      session: SIGNED_IN_SESSION,
    });
  });

  it('does not call sign-in when initialization fails during sign-in', async () => {
    harness.initialize.mockRejectedValueOnce(new Error('Mock initialize failure'));
    const controller = createSettingsAuthController(harness.client);

    await controller.signIn();

    expect(harness.initialize).toHaveBeenCalledTimes(1);
    expect(harness.signIn).not.toHaveBeenCalled();
    expect(controller.getState().error).toEqual(
      expect.objectContaining({
        message: 'Mock initialize failure',
      }),
    );
  });

  it('waits for in-flight initialization before continuing sign-in', async () => {
    const initializeDeferred = createDeferred<void>();
    harness.initialize.mockImplementationOnce(async () => {
      await initializeDeferred.promise;
    });
    const controller = createSettingsAuthController(harness.client);

    const initializePromise = controller.initialize();
    const signInPromise = controller.signIn();

    expect(harness.initialize).toHaveBeenCalledTimes(1);
    expect(harness.signIn).not.toHaveBeenCalled();

    initializeDeferred.resolve();
    await Promise.all([initializePromise, signInPromise]);

    expect(harness.signIn).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
      session: SIGNED_IN_SESSION,
    });
  });

  it('transitions through signing_in and returns to idle after successful sign-in', async () => {
    const signInDeferred = createDeferred<void>();
    harness.signIn.mockImplementationOnce(async () => {
      await signInDeferred.promise;
      harness.setSession(SIGNED_IN_SESSION);
    });
    const controller = createSettingsAuthController(harness.client);
    await controller.initialize();

    const signInPromise = controller.signIn();
    expect(controller.getState().operation).toBe('signing_in');

    signInDeferred.resolve();
    await signInPromise;

    expect(harness.signIn).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
      session: SIGNED_IN_SESSION,
    });
  });

  it('ignores duplicate sign-in requests while a sign-in operation is in progress', async () => {
    const signInDeferred = createDeferred<void>();
    harness.signIn.mockImplementation(async () => {
      await signInDeferred.promise;
      harness.setSession(SIGNED_IN_SESSION);
    });
    const controller = createSettingsAuthController(harness.client);
    await controller.initialize();

    const firstSignIn = controller.signIn();
    const secondSignIn = controller.signIn();

    expect(harness.signIn).toHaveBeenCalledTimes(1);

    signInDeferred.resolve();
    await Promise.all([firstSignIn, secondSignIn]);
  });

  it('waits for in-flight initialization before continuing sign-out', async () => {
    const initializeDeferred = createDeferred<void>();
    harness.setSession(SIGNED_IN_SESSION);
    harness.initialize.mockImplementationOnce(async () => {
      await initializeDeferred.promise;
    });
    const controller = createSettingsAuthController(harness.client);

    const initializePromise = controller.initialize();
    const signOutPromise = controller.signOut();

    expect(harness.initialize).toHaveBeenCalledTimes(1);
    expect(harness.signOut).not.toHaveBeenCalled();

    initializeDeferred.resolve();
    await Promise.all([initializePromise, signOutPromise]);

    expect(harness.signOut).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({
      operation: 'idle',
      error: null,
      session: SIGNED_OUT_SESSION,
    });
  });

  it('captures sign-out errors and preserves authenticated session state', async () => {
    harness.setSession(SIGNED_IN_SESSION);
    harness.signOut.mockRejectedValueOnce(new Error('Mock sign-out failure'));
    const controller = createSettingsAuthController(harness.client);
    await controller.initialize();

    await controller.signOut();

    expect(controller.getState().operation).toBe('idle');
    expect(controller.getState().session).toEqual(SIGNED_IN_SESSION);
    expect(controller.getState().error).toEqual(
      expect.objectContaining({
        code: 'unknown',
        message: 'Mock sign-out failure',
      }),
    );
  });
});
