<!-- Renders settings auth controls and the OneDrive DB file selection flow for the current session. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { AuthClient } from '@auth';
  import type { CacheStore } from '@cache';
  import type { GraphClient, GraphDriveItem } from '@graph';
  import { appSelectedDriveItemBindingStore } from '@shared';

  import {
    createSettingsAuthController,
    type SettingsAuthOperation,
    type SettingsAuthState,
  } from './settingsAuthController';
  import SkeletonCard from '../components/SkeletonCard.svelte';
  import {
    createSettingsFileBindingController,
    type SettingsFileBindingState,
  } from './settingsFileBindingController';
  import {
    createSettingsLocalDataController,
    type SettingsLocalDataResetState,
  } from './settingsLocalDataController';
  import { resolveSettingsAuthClient } from './settingsAuthClientResolver';
  import { resolveSettingsCacheStore } from './settingsCacheStoreResolver';
  import { resolveSettingsGraphClient } from './settingsGraphClientResolver';

  export let authClient: AuthClient = resolveSettingsAuthClient();
  export let cacheStore: Pick<CacheStore, 'clearAll'> = resolveSettingsCacheStore();
  export let graphClient: GraphClient = resolveSettingsGraphClient();

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
  let bindingState: SettingsFileBindingState = {
    selectedBinding: null,
    currentFolder: null,
    items: [],
    browserIsOpen: false,
    operation: 'idle',
    error: null,
    hasLoaded: false,
    canGoBack: false,
  };
  let bindingStatusMessage = 'Sign in to browse and choose a .db file.';
  let localDataResetState: SettingsLocalDataResetState = {
    operation: 'idle',
    error: null,
  };
  let localDataResetDialogElement: HTMLDialogElement | null = null;

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

  const buildBindingStatusMessage = (nextState: SettingsFileBindingState): string => {
    if (!state.session.isAuthenticated) {
      return 'Sign in to browse and choose a .db file.';
    }

    if (nextState.operation === 'loading') {
      return 'Loading OneDrive files...';
    }

    if (nextState.error !== null) {
      return `File selection error. ${nextState.error.message}`;
    }

    if (nextState.selectedBinding !== null) {
      return 'DB file selected.';
    }

    if (nextState.hasLoaded) {
      return 'Choose a .db file from the current OneDrive folder.';
    }

    return 'No DB file selected yet.';
  };

  const folderItems = (items: readonly GraphDriveItem[]): readonly GraphDriveItem[] =>
    items.filter((item) => item.kind === 'folder');

  const selectableFileItems = (items: readonly GraphDriveItem[]): readonly GraphDriveItem[] =>
    items.filter((item) => item.kind === 'file');

  const authController = createSettingsAuthController(authClient);
  const fileBindingController = createSettingsFileBindingController(graphClient, {
    onBindingChange: (binding) => {
      if (binding === null) {
        appSelectedDriveItemBindingStore.clear();
        return;
      }

      appSelectedDriveItemBindingStore.setBinding(binding);
    },
  });
  const localDataController = createSettingsLocalDataController(cacheStore, {
    onLocalDataReset: () => {
      appSelectedDriveItemBindingStore.clear();
      fileBindingController.reset();
    },
  });
  const unsubscribe = authController.subscribe((nextState) => {
    const previousAccountId = state.session.account?.homeAccountId ?? null;
    const wasAuthenticated = state.session.isAuthenticated;
    state = nextState;
    const nextAccountId = nextState.session.account?.homeAccountId ?? null;
    authOperationIsPending = nextState.operation !== 'idle';
    authStatusMessage = buildStatusMessage(nextState);
    bindingStatusMessage = buildBindingStatusMessage(bindingState);

    if (nextState.session.isAuthenticated && previousAccountId !== nextAccountId) {
      appSelectedDriveItemBindingStore.setActiveAccountId(nextAccountId);
      fileBindingController.hydrateSelectedBinding(get(appSelectedDriveItemBindingStore));
    }

    if (!nextState.session.isAuthenticated) {
      appSelectedDriveItemBindingStore.setActiveAccountId(null);
      localDataController.cancelReset();
    }

    if (wasAuthenticated && !nextState.session.isAuthenticated) {
      fileBindingController.reset();
    }
  });
  const unsubscribeFileBinding = fileBindingController.subscribe((nextState) => {
    bindingState = nextState;
    bindingStatusMessage = buildBindingStatusMessage(nextState);
  });
  const unsubscribeLocalDataReset = localDataController.subscribe((nextState) => {
    localDataResetState = nextState;
  });

  const handleSignInClick = (): void => {
    void authController.signIn();
  };

  const handleSignOutClick = (): void => {
    void authController.signOut();
  };

  const handleBrowseClick = (): void => {
    void fileBindingController.browseRoot();
  };

  const handleCancelBrowseClick = (): void => {
    fileBindingController.cancelBrowse();
  };

  const handleRequestLocalResetClick = (): void => {
    localDataController.requestReset();
  };

  const handleCancelLocalResetClick = (): void => {
    localDataController.cancelReset();
  };

  const handleConfirmLocalResetClick = (): void => {
    void localDataController.confirmReset();
  };

  const handleLocalResetDialogCancel = (event: Event): void => {
    event.preventDefault();
    localDataController.cancelReset();
  };

  const handleBackClick = (): void => {
    void fileBindingController.goBack();
  };

  const handleOpenFolderClick = (item: GraphDriveItem): void => {
    void fileBindingController.openFolder(item);
  };

  const handleSelectFileClick = (item: GraphDriveItem): void => {
    fileBindingController.selectFile(item);
  };

  $: if (localDataResetDialogElement !== null) {
    if (localDataResetState.operation === 'idle') {
      if (localDataResetDialogElement.open) {
        localDataResetDialogElement.close();
      }
    } else if (!localDataResetDialogElement.open) {
      localDataResetDialogElement.showModal();
    }
  }

  onMount(() => {
    void authController.initialize();
  });

  onDestroy(() => {
    unsubscribe();
    unsubscribeFileBinding();
    unsubscribeLocalDataReset();
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

    <h3 class="settings-screen__subheading">DB file</h3>
    <p
      class="settings-screen__binding-status"
      data-testid="binding-status-message"
      aria-live="polite"
    >
      {bindingStatusMessage}
    </p>

    {#if bindingState.error !== null}
      <p class="settings-screen__binding-error" role="alert">
        {bindingState.error.message}
      </p>
    {/if}

    <div class="settings-screen__actions">
      <button
        class="app-button app-button--primary"
        type="button"
        on:click={handleBrowseClick}
        disabled={authOperationIsPending ||
          bindingState.operation !== 'idle' ||
          localDataResetState.operation !== 'idle'}
      >
        {bindingState.selectedBinding === null ? 'Select DB File' : 'Change DB file'}
      </button>

      {#if bindingState.browserIsOpen}
        {#if bindingState.canGoBack}
          <button
            class="app-button app-button--secondary"
            type="button"
            on:click={handleBackClick}
            disabled={bindingState.operation !== 'idle'}
          >
            Back to parent folder
          </button>
        {/if}

        <button
          class="app-button app-button--secondary"
          type="button"
          data-testid="cancel-db-file-browser-button"
          on:click={handleCancelBrowseClick}
          disabled={localDataResetState.operation !== 'idle'}
        >
          Cancel
        </button>
      {/if}
    </div>

    <div class="settings-screen__actions">
      <button
        class="app-button app-button--danger"
        type="button"
        data-testid="reset-local-app-data-button"
        on:click={handleRequestLocalResetClick}
        disabled={authOperationIsPending ||
          bindingState.operation !== 'idle' ||
          localDataResetState.operation !== 'idle'}
      >
        Reset local app data
      </button>
    </div>

    <dialog
      bind:this={localDataResetDialogElement}
      class="settings-screen__confirmation"
      aria-labelledby="reset-local-data-title"
      data-testid="reset-local-app-data-confirmation"
      on:cancel={handleLocalResetDialogCancel}
    >
      <h4 id="reset-local-data-title">Reset local app data?</h4>
      <p>
        This clears local DB file binding and cached app data on this device for the signed-in
        account.
      </p>

      {#if localDataResetState.error !== null}
        <p class="settings-screen__confirmation-error" role="alert">
          {localDataResetState.error.message}
        </p>
      {/if}

      {#if localDataResetState.operation === 'resetting'}
        <p class="settings-screen__confirmation-status" aria-live="polite">
          Resetting local app data...
        </p>
      {/if}

      <div class="settings-screen__actions">
        <button
          class="app-button app-button--secondary"
          type="button"
          on:click={handleCancelLocalResetClick}
          disabled={localDataResetState.operation === 'resetting'}
        >
          Cancel
        </button>
        <button
          class="app-button app-button--danger"
          type="button"
          data-testid="confirm-reset-local-app-data-button"
          on:click={handleConfirmLocalResetClick}
          disabled={localDataResetState.operation === 'resetting'}
        >
          Confirm reset
        </button>
      </div>
    </dialog>

    {#if bindingState.selectedBinding !== null}
      <dl class="settings-screen__binding-summary" data-testid="selected-db-file-summary">
        <div>
          <dt>File name</dt>
          <dd>{bindingState.selectedBinding.name}</dd>
        </div>
        <div>
          <dt>Folder path</dt>
          <dd>{bindingState.selectedBinding.parentPath}</dd>
        </div>
      </dl>
    {/if}

    {#if bindingState.browserIsOpen}
      <section
        class="settings-screen__browser"
        data-testid="db-file-browser"
        aria-busy={bindingState.operation === 'loading'}
      >
        <header class="settings-screen__browser-header">
          <h4>Current folder</h4>
          <p>{bindingState.currentFolder?.path ?? '/'}</p>
        </header>

        {#if bindingState.operation === 'loading'}
          <p class="settings-screen__browser-loading" aria-live="polite">
            Loading the current OneDrive folder...
          </p>
          <div class="settings-screen__browser-skeletons" data-testid="db-file-browser-loading">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        {:else if bindingState.error === null && bindingState.items.length === 0 && bindingState.hasLoaded}
          <p class="settings-screen__browser-empty">No folders or .db files found here.</p>
        {:else}
          {#if folderItems(bindingState.items).length > 0}
            <div class="settings-screen__browser-group">
              <h4>Folders</h4>
              <ul class="settings-screen__browser-list">
                {#each folderItems(bindingState.items) as item (item.itemId)}
                  <li>
                    <button
                      class="settings-screen__browser-item settings-screen__browser-item--folder"
                      type="button"
                      data-testid={`open-folder-${item.itemId}`}
                      on:click={() => handleOpenFolderClick(item)}
                      disabled={bindingState.operation !== 'idle'}
                    >
                      <span>{item.name}</span>
                      <span>Open folder</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if selectableFileItems(bindingState.items).length > 0}
            <div class="settings-screen__browser-group">
              <h4>Database files</h4>
              <ul class="settings-screen__browser-list">
                {#each selectableFileItems(bindingState.items) as item (item.itemId)}
                  <li>
                    <button
                      class="settings-screen__browser-item settings-screen__browser-item--file"
                      type="button"
                      data-testid={`select-file-${item.itemId}`}
                      on:click={() => handleSelectFileClick(item)}
                      disabled={bindingState.operation !== 'idle'}
                    >
                      <span>{item.name}</span>
                      <span>Select file</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  {/if}

  <div class="settings-screen__actions">
    {#if state.session.isAuthenticated}
      <button
        class="app-button app-button--secondary"
        type="button"
        on:click={handleSignOutClick}
        disabled={authOperationIsPending || localDataResetState.operation !== 'idle'}
      >
        Sign out
      </button>
    {:else}
      <button
        class="app-button app-button--primary"
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
    padding: 1rem;
    border: none;
    border-radius: var(--radius-md);
    color: #991b1b;
    background: #fef2f2;
  }

  .settings-screen__binding-status {
    margin: 0;
    color: var(--text-secondary);
  }

  .settings-screen__binding-error {
    margin: 0;
    padding: 1rem;
    border: none;
    border-radius: var(--radius-md);
    color: #991b1b;
    background: #fef2f2;
  }

  .settings-screen__subheading {
    margin: 0;
    font-size: 0.98rem;
  }

  .settings-screen__account-summary,
  .settings-screen__binding-summary {
    margin: 0;
    display: grid;
    gap: 0.55rem;
  }

  .settings-screen__account-summary div,
  .settings-screen__binding-summary div {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem;
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .settings-screen__account-summary dt,
  .settings-screen__binding-summary dt {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .settings-screen__account-summary dd,
  .settings-screen__binding-summary dd {
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

  .settings-screen__confirmation {
    display: grid;
    gap: 0.85rem;
    width: min(32rem, calc(100vw - 2rem));
    max-width: 100%;
    margin: auto;
    padding: 1.5rem;
    border: none;
    border-radius: var(--radius-lg);
    background: #fef2f2;
    box-shadow: var(--shadow-lg);
  }

  .settings-screen__confirmation:not([open]) {
    display: none;
  }

  .settings-screen__confirmation::backdrop {
    background: color-mix(in srgb, black 40%, transparent);
  }

  .settings-screen__confirmation h4,
  .settings-screen__confirmation p {
    margin: 0;
  }

  .settings-screen__confirmation-status {
    color: var(--text-secondary);
  }

  .settings-screen__confirmation-error {
    color: #7d1111;
  }

  .settings-screen__browser {
    display: grid;
    gap: 0.85rem;
    padding: 1.25rem;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .settings-screen__browser-header {
    display: grid;
    gap: 0.2rem;
  }

  .settings-screen__browser-header h4,
  .settings-screen__browser-group h4 {
    margin: 0;
    font-size: 0.88rem;
  }

  .settings-screen__browser-header p,
  .settings-screen__browser-empty {
    margin: 0;
    color: var(--text-secondary);
    word-break: break-word;
  }

  .settings-screen__browser-loading {
    margin: 0;
    color: var(--text-secondary);
  }

  .settings-screen__browser-skeletons {
    display: grid;
    gap: 0.75rem;
  }

  .settings-screen__browser-group {
    display: grid;
    gap: 0.5rem;
  }

  .settings-screen__browser-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.45rem;
  }

  .settings-screen__browser-item {
    width: 100%;
    min-height: 3rem;
    padding: 0.85rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .settings-screen__browser-item:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .settings-screen__browser-item--folder {
    border-left: 4px solid var(--accent);
  }

  .settings-screen__browser-item--file {
    border-left: 4px solid var(--positive);
  }
</style>
