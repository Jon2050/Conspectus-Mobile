<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { AuthClient } from '@auth';

  import {
    createSettingsAuthController,
    type SettingsAuthOperation,
    type SettingsAuthState,
  } from './settingsAuthController';
  import { resolveSettingsAuthClient } from './settingsAuthClientResolver';

  export let authClient: AuthClient = resolveSettingsAuthClient();

  let state: SettingsAuthState = {
    session: {
      isAuthenticated: false,
      account: null,
    },
    operation: 'idle',
    error: null,
  };
  let authOperationIsPending = false;
  let authStatusMessage = 'Signed out.';

  const statusMessageByOperation: Record<SettingsAuthOperation, string> = {
    initializing: 'Checking authentication status...',
    idle: '',
    signing_in: 'Opening Microsoft sign-in...',
    signing_out: 'Signing out...',
  };

  const buildStatusMessage = (nextState: SettingsAuthState): string => {
    if (nextState.operation !== 'idle') {
      return statusMessageByOperation[nextState.operation];
    }

    if (nextState.error !== null) {
      return `Authentication error. ${nextState.error.message}`;
    }

    return nextState.session.isAuthenticated ? 'Signed in.' : 'Signed out.';
  };

  const authController = createSettingsAuthController(authClient);
  const unsubscribe = authController.subscribe((nextState) => {
    state = nextState;
    authOperationIsPending = nextState.operation !== 'idle';
    authStatusMessage = buildStatusMessage(nextState);
  });

  const handleSignInClick = (): void => {
    void authController.signIn();
  };

  const handleSignOutClick = (): void => {
    void authController.signOut();
  };

  onMount(() => {
    void authController.initialize();
  });

  onDestroy(() => {
    unsubscribe();
  });
</script>

<section class="placeholder-screen settings-screen" data-testid="route-settings">
  <h2>Settings</h2>
  <p>Authentication controls for OneDrive account access.</p>

  <p class="settings-screen__auth-status" data-testid="auth-status-message" aria-live="polite">
    {authStatusMessage}
  </p>

  {#if state.error !== null}
    <p class="settings-screen__auth-error" role="alert">
      {state.error.message}
    </p>
  {/if}

  {#if state.session.isAuthenticated && state.session.account !== null}
    <h3 class="settings-screen__subheading">OneDrive account</h3>
    <dl class="settings-screen__account-summary" data-testid="signed-in-account-summary">
      <div>
        <dt>Name</dt>
        <dd>{state.session.account.displayName ?? 'Unknown'}</dd>
      </div>
      <div>
        <dt>Username</dt>
        <dd>{state.session.account.username}</dd>
      </div>
      <div>
        <dt>Account ID</dt>
        <dd>{state.session.account.homeAccountId}</dd>
      </div>
    </dl>
  {/if}

  <div class="settings-screen__actions">
    {#if state.session.isAuthenticated}
      <button
        class="settings-screen__button settings-screen__button--secondary"
        type="button"
        on:click={handleSignOutClick}
        disabled={authOperationIsPending}
      >
        Sign out
      </button>
    {:else}
      <button
        class="settings-screen__button settings-screen__button--primary"
        type="button"
        on:click={handleSignInClick}
        disabled={authOperationIsPending}
      >
        Sign in with Microsoft
      </button>
    {/if}
  </div>
</section>

<style>
  .settings-screen {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .settings-screen__auth-status {
    margin: 0;
    color: var(--text-secondary);
  }

  .settings-screen__auth-error {
    margin: 0;
    padding: 0.65rem;
    border: 1px solid color-mix(in srgb, var(--error) 40%, var(--border));
    border-radius: 0.75rem;
    color: #7d1111;
    background: #ffe9e9;
  }

  .settings-screen__subheading {
    margin: 0;
    font-size: 0.98rem;
  }

  .settings-screen__account-summary {
    margin: 0;
    display: grid;
    gap: 0.55rem;
  }

  .settings-screen__account-summary div {
    display: grid;
    gap: 0.2rem;
    padding: 0.65rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--surface) 94%, white);
  }

  .settings-screen__account-summary dt {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .settings-screen__account-summary dd {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-primary);
    word-break: break-word;
  }

  .settings-screen__actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .settings-screen__button {
    min-height: 2.75rem;
    padding: 0.55rem 0.95rem;
    border-radius: 0.75rem;
    border: 1px solid transparent;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background-color 120ms ease;
  }

  .settings-screen__button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .settings-screen__button--primary {
    color: #ffffff;
    background: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 80%, black);
  }

  .settings-screen__button--secondary {
    color: var(--text-primary);
    background: var(--surface);
    border-color: var(--border);
  }
</style>
