<!-- Renders settings auth controls and the OneDrive DB file selection flow for the current session. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { AuthClient } from '@auth';
  import type { GraphClient, GraphDriveItem } from '@graph';
  import {
    appSelectedDriveItemBindingStore,
    appSyncStateStore,
    getFallbackBuildInfo,
    loadBuildInfo,
    type BuildInfo,
    type SyncStateStore,
  } from '@shared';
  import { _ } from 'svelte-i18n';

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
  import { resolveSettingsCacheStore, type SettingsCacheStore } from './settingsCacheStoreResolver';
  import { resolveSettingsGraphClient } from './settingsGraphClientResolver';
  import { formatSettingsTimestampUtc } from './settingsInformation';

  export let authClient: AuthClient = resolveSettingsAuthClient();
  export let cacheStore: SettingsCacheStore = resolveSettingsCacheStore();
  export let graphClient: GraphClient = resolveSettingsGraphClient();
  export let syncStateStore: SyncStateStore = appSyncStateStore;
  export let onForceRefresh: (() => Promise<void>) | null = null;

  let state: SettingsAuthState = {
    session: {
      isAuthenticated: false,
      account: null,
    },
    operation: 'idle',
    error: null,
  };
  let authOperationIsPending = false;
  let authStatusMessage = $_('settings.status.signedOut');
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
  let bindingStatusMessage = $_('settings.db.status.signInRequired');
  let localDataResetState: SettingsLocalDataResetState = {
    operation: 'idle',
    error: null,
  };
  let localDataResetDialogElement: HTMLDialogElement | null = null;
  let lastSyncAtIso: string | null = null;
  let syncMetadataRequestId = 0;
  let loadedSyncMetadataBindingKey: string | null = null;
  let buildInfo: BuildInfo = getFallbackBuildInfo();
  let forceRefreshIsPending = false;
  let forceRefreshStatusIsVisible = false;
  let syncSnapshot = get(syncStateStore);

  const buildStatusMessage = (nextState: SettingsAuthState): string => {
    if (nextState.operation !== 'idle') {
      const operationMap: Record<SettingsAuthOperation, string> = {
        initializing: $_('settings.status.checking'),
        idle: '',
        signing_in: $_('settings.status.openingSignIn'),
        signing_out: $_('settings.status.signingOut'),
      };
      return operationMap[nextState.operation];
    }

    if (nextState.error !== null) {
      return `${$_('settings.status.errorPrefix')} ${nextState.error.message}`;
    }

    return nextState.session.isAuthenticated
      ? $_('settings.status.signedIn')
      : $_('settings.status.signedOut');
  };

  const buildBindingStatusMessage = (nextState: SettingsFileBindingState): string => {
    if (!state.session.isAuthenticated) {
      return $_('settings.db.status.signInRequired');
    }

    if (nextState.operation === 'loading') {
      return $_('settings.db.status.loading');
    }

    if (nextState.error !== null) {
      return `${$_('settings.db.status.errorPrefix')} ${nextState.error.message}`;
    }

    if (nextState.selectedBinding !== null) {
      return $_('settings.db.status.selected');
    }

    if (nextState.hasLoaded) {
      return $_('settings.db.status.choose');
    }

    return $_('settings.db.status.notSelected');
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

  const handleForceRefreshClick = async (): Promise<void> => {
    if (onForceRefresh === null || forceRefreshIsPending || syncSnapshot.state === 'syncing') {
      return;
    }

    forceRefreshIsPending = true;
    forceRefreshStatusIsVisible = true;
    try {
      await onForceRefresh();
    } finally {
      forceRefreshIsPending = false;
    }
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

  const resolveDbFilePath = (binding: { parentPath: string; name: string }): string => {
    const { parentPath, name } = binding;
    if (parentPath === '/') {
      return `/${name}`;
    }
    return `${parentPath.endsWith('/') ? parentPath : parentPath + '/'}${name}`;
  };

  const loadLastSyncMetadata = async (
    isAuthenticated: boolean,
    binding: SettingsFileBindingState['selectedBinding'],
    resetForceRefreshStatus = true,
  ): Promise<void> => {
    if (!isAuthenticated || binding === null) {
      loadedSyncMetadataBindingKey = null;
      syncMetadataRequestId += 1;
      lastSyncAtIso = null;
      forceRefreshStatusIsVisible = false;
      return;
    }

    const bindingKey = `${binding.driveId}:${binding.itemId}`;
    if (bindingKey === loadedSyncMetadataBindingKey) {
      return;
    }

    loadedSyncMetadataBindingKey = bindingKey;
    if (resetForceRefreshStatus) {
      forceRefreshStatusIsVisible = false;
    }
    const requestId = ++syncMetadataRequestId;
    try {
      const snapshot = await cacheStore.readSnapshot(binding);
      if (requestId === syncMetadataRequestId) {
        lastSyncAtIso = snapshot?.metadata.lastSyncAtIso ?? null;
      }
    } catch {
      if (requestId === syncMetadataRequestId) {
        lastSyncAtIso = null;
      }
    }
  };

  $: void loadLastSyncMetadata(state.session.isAuthenticated, bindingState.selectedBinding);

  const unsubscribeSyncState = syncStateStore.subscribe((syncState) => {
    syncSnapshot = syncState;
    if (syncState.state !== 'synced') {
      return;
    }

    loadedSyncMetadataBindingKey = null;
    void loadLastSyncMetadata(state.session.isAuthenticated, bindingState.selectedBinding, false);
  });

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
    void loadBuildInfo().then((loadedBuildInfo) => {
      buildInfo = loadedBuildInfo;
    });
  });

  onDestroy(() => {
    unsubscribe();
    unsubscribeFileBinding();
    unsubscribeLocalDataReset();
    unsubscribeSyncState();
  });
</script>

<section class="placeholder-screen settings-screen" data-testid="route-settings">
  <h2>{$_('settings.title')}</h2>
  <p>{$_('settings.description')}</p>

  <section
    class="settings-screen__safety-card"
    data-testid="settings-safety-recovery"
    aria-labelledby="settings-safety-heading"
  >
    <h3 id="settings-safety-heading">{$_('settings.safety.heading')}</h3>
    <p class="settings-screen__safety-warning">{$_('settings.safety.warning')}</p>
    <p>{$_('settings.safety.explanation')}</p>

    <h4>{$_('settings.safety.recoveryHeading')}</h4>
    <p>{$_('settings.safety.recoveryDescription')}</p>
    <a
      class="settings-screen__safety-link"
      href="https://support.microsoft.com/en-us/onedrive/restore-a-previous-version-of-a-file-stored-in-onedrive"
      target="_blank"
      rel="noopener noreferrer"
    >
      {$_('settings.safety.recoveryLink')}
    </a>
  </section>

  <p class="settings-screen__auth-status" data-testid="auth-status-message" aria-live="polite">
    {authStatusMessage}
  </p>

  {#if state.error !== null}
    <p class="settings-screen__auth-error" role="alert">
      {state.error.message}
    </p>
  {/if}

  {#if state.session.isAuthenticated && state.session.account !== null}
    <h3 class="settings-screen__subheading">{$_('settings.account.heading')}</h3>
    <dl class="settings-screen__account-summary" data-testid="signed-in-account-summary">
      <div>
        <dt>{$_('settings.account.name')}</dt>
        <dd>{state.session.account.displayName ?? $_('settings.account.unknown')}</dd>
      </div>
      <div>
        <dt>{$_('settings.account.username')}</dt>
        <dd>{state.session.account.username}</dd>
      </div>
    </dl>

    <h3 class="settings-screen__subheading">{$_('settings.db.heading')}</h3>
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

    <h4 class="settings-screen__action-heading">{$_('settings.actions.standard')}</h4>
    <div class="settings-screen__actions" data-testid="standard-settings-actions">
      <button
        class="app-button app-button--primary"
        type="button"
        on:click={handleBrowseClick}
        disabled={authOperationIsPending ||
          bindingState.operation !== 'idle' ||
          localDataResetState.operation !== 'idle'}
      >
        {bindingState.selectedBinding === null
          ? $_('settings.db.actions.select')
          : $_('settings.db.actions.change')}
      </button>

      {#if bindingState.selectedBinding !== null && onForceRefresh !== null}
        <button
          class="app-button app-button--secondary"
          type="button"
          data-testid="force-refresh-button"
          aria-busy={forceRefreshIsPending}
          on:click={() => void handleForceRefreshClick()}
          disabled={authOperationIsPending ||
            bindingState.operation !== 'idle' ||
            localDataResetState.operation !== 'idle' ||
            forceRefreshIsPending ||
            syncSnapshot.state === 'syncing'}
        >
          {forceRefreshIsPending ? $_('settings.sync.refreshing') : $_('settings.sync.refresh')}
        </button>
      {/if}

      {#if bindingState.browserIsOpen}
        {#if bindingState.canGoBack}
          <button
            class="app-button app-button--secondary"
            type="button"
            on:click={handleBackClick}
            disabled={bindingState.operation !== 'idle'}
          >
            {$_('settings.db.actions.back')}
          </button>
        {/if}

        <button
          class="app-button app-button--secondary"
          type="button"
          data-testid="cancel-db-file-browser-button"
          on:click={handleCancelBrowseClick}
          disabled={localDataResetState.operation !== 'idle'}
        >
          {$_('settings.db.actions.cancel')}
        </button>
      {/if}
    </div>

    <h4 class="settings-screen__action-heading settings-screen__action-heading--danger">
      {$_('settings.actions.destructive')}
    </h4>
    <div class="settings-screen__actions" data-testid="destructive-settings-actions">
      <button
        class="app-button app-button--danger"
        type="button"
        data-testid="reset-local-app-data-button"
        on:click={handleRequestLocalResetClick}
        disabled={authOperationIsPending ||
          bindingState.operation !== 'idle' ||
          localDataResetState.operation !== 'idle'}
      >
        {$_('settings.reset.button')}
      </button>
    </div>

    <dialog
      bind:this={localDataResetDialogElement}
      class="settings-screen__confirmation"
      aria-labelledby="reset-local-data-title"
      data-testid="reset-local-app-data-confirmation"
      on:cancel={handleLocalResetDialogCancel}
    >
      <h4 id="reset-local-data-title">{$_('settings.reset.title')}</h4>
      <p>
        {$_('settings.reset.description')}
      </p>

      {#if localDataResetState.error !== null}
        <p class="settings-screen__confirmation-error" role="alert">
          {localDataResetState.error.message}
        </p>
      {/if}

      {#if localDataResetState.operation === 'resetting'}
        <p class="settings-screen__confirmation-status" aria-live="polite">
          {$_('settings.reset.status')}
        </p>
      {/if}

      <div class="settings-screen__actions">
        <button
          class="app-button app-button--secondary"
          type="button"
          on:click={handleCancelLocalResetClick}
          disabled={localDataResetState.operation === 'resetting'}
        >
          {$_('settings.reset.cancel')}
        </button>
        <button
          class="app-button app-button--danger"
          type="button"
          data-testid="confirm-reset-local-app-data-button"
          on:click={handleConfirmLocalResetClick}
          disabled={localDataResetState.operation === 'resetting'}
        >
          {$_('settings.reset.confirm')}
        </button>
      </div>
    </dialog>

    {#if bindingState.selectedBinding !== null}
      <dl class="settings-screen__binding-summary" data-testid="selected-db-file-summary">
        <div>
          <dt>{$_('settings.db.summary.dbFile')}</dt>
          <dd>{resolveDbFilePath(bindingState.selectedBinding)}</dd>
        </div>
        <div>
          <dt>{$_('settings.sync.lastSync')}</dt>
          <dd data-testid="settings-last-sync">
            {lastSyncAtIso === null
              ? $_('settings.sync.never')
              : formatSettingsTimestampUtc(lastSyncAtIso) || $_('settings.sync.unknown')}
          </dd>
        </div>
      </dl>

      {#if forceRefreshStatusIsVisible && syncSnapshot.state !== 'idle' && syncSnapshot.message !== null}
        <p
          class="settings-screen__sync-status"
          data-testid="force-refresh-status"
          role={syncSnapshot.state === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {syncSnapshot.message}
        </p>
      {/if}
    {/if}

    {#if bindingState.browserIsOpen}
      <section
        class="settings-screen__browser"
        data-testid="db-file-browser"
        aria-busy={bindingState.operation === 'loading'}
      >
        <header class="settings-screen__browser-header">
          <h4>{$_('settings.browser.currentFolder')}</h4>
          <p>{bindingState.currentFolder?.path ?? '/'}</p>
        </header>

        {#if bindingState.operation === 'loading'}
          <p class="settings-screen__browser-loading" aria-live="polite">
            {$_('settings.browser.loading')}
          </p>
          <div class="settings-screen__browser-skeletons" data-testid="db-file-browser-loading">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        {:else if bindingState.error === null && bindingState.items.length === 0 && bindingState.hasLoaded}
          <p class="settings-screen__browser-empty">{$_('settings.browser.empty')}</p>
        {:else}
          {#if folderItems(bindingState.items).length > 0}
            <div class="settings-screen__browser-group">
              <h4>{$_('settings.browser.foldersHeading')}</h4>
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
                      <span>{$_('settings.browser.openFolder')}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if selectableFileItems(bindingState.items).length > 0}
            <div class="settings-screen__browser-group">
              <h4>{$_('settings.browser.filesHeading')}</h4>
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
                      <span>{$_('settings.browser.selectFile')}</span>
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

  <h3 class="settings-screen__subheading">{$_('settings.actions.account')}</h3>
  <div class="settings-screen__actions" data-testid="account-settings-actions">
    {#if state.session.isAuthenticated}
      <button
        class="app-button app-button--secondary"
        type="button"
        on:click={handleSignOutClick}
        disabled={authOperationIsPending || localDataResetState.operation !== 'idle'}
      >
        {$_('settings.generalActions.signOut')}
      </button>
    {:else}
      <button
        class="app-button app-button--primary"
        type="button"
        on:click={handleSignInClick}
        disabled={authOperationIsPending}
      >
        {$_('settings.generalActions.signIn')}
      </button>
    {/if}
  </div>

  <section class="settings-screen__information" data-testid="settings-build-information">
    <h3 class="settings-screen__subheading">{$_('settings.build.heading')}</h3>
    <dl class="settings-screen__information-list">
      <div>
        <dt>{$_('settings.build.version')}</dt>
        <dd data-testid="settings-build-version">{buildInfo.version}</dd>
      </div>
      <div>
        <dt>{$_('settings.build.builtReleased')}</dt>
        <dd data-testid="settings-build-time">
          {formatSettingsTimestampUtc(buildInfo.buildTimeUtc) || $_('settings.build.unknown')}
        </dd>
      </div>
    </dl>
  </section>
</section>

<style>
  .settings-screen {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    --settings-error-color: color-mix(in srgb, var(--negative) 72%, var(--text-primary));
    --settings-error-surface: color-mix(in srgb, var(--negative) 14%, var(--surface-strong));
    --settings-dialog-border: color-mix(in srgb, var(--negative) 22%, var(--border));
  }

  .settings-screen__auth-status {
    margin: 0;
    color: var(--text-secondary);
  }

  .settings-screen__safety-card {
    display: grid;
    gap: 0.65rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--negative) 24%, var(--border));
    border-left: 0.3rem solid var(--negative);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--negative) 8%, var(--surface-strong));
    box-shadow: var(--shadow-sm);
  }

  .settings-screen__safety-card h3,
  .settings-screen__safety-card h4,
  .settings-screen__safety-card p {
    margin: 0;
  }

  .settings-screen__safety-card h3 {
    font-size: 1rem;
  }

  .settings-screen__safety-card h4 {
    margin-top: 0.25rem;
    font-size: 0.9rem;
  }

  .settings-screen__safety-warning {
    color: var(--settings-error-color);
    font-weight: 700;
  }

  .settings-screen__safety-link {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    min-height: 2.75rem;
    padding: 0.35rem 0.5rem;
    color: var(--text-primary);
    font-weight: 650;
    text-decoration-color: var(--accent);
    text-decoration-thickness: 0.125rem;
    text-underline-offset: 0.18em;
  }

  .settings-screen__safety-link:focus-visible {
    border-radius: var(--radius-sm);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .settings-screen__auth-error {
    margin: 0;
    padding: 1rem;
    border: none;
    border-radius: var(--radius-md);
    color: var(--settings-error-color);
    background: var(--settings-error-surface);
  }

  .settings-screen__binding-status {
    margin: 0;
    color: var(--text-secondary);
  }

  .settings-screen__sync-status {
    margin: 0;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-strong));
    color: var(--text-primary);
  }

  .settings-screen__binding-error {
    margin: 0;
    padding: 1rem;
    border: none;
    border-radius: var(--radius-md);
    color: var(--settings-error-color);
    background: var(--settings-error-surface);
  }

  .settings-screen__subheading {
    margin: 0;
    font-size: 0.98rem;
  }

  .settings-screen__action-heading {
    margin: 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .settings-screen__action-heading--danger {
    color: var(--settings-error-color);
  }

  .settings-screen__account-summary,
  .settings-screen__binding-summary,
  .settings-screen__information-list {
    margin: 0;
    display: grid;
    gap: 0.55rem;
  }

  .settings-screen__account-summary div,
  .settings-screen__binding-summary div,
  .settings-screen__information-list div {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem;
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .settings-screen__account-summary dt,
  .settings-screen__binding-summary dt,
  .settings-screen__information-list dt {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .settings-screen__account-summary dd,
  .settings-screen__binding-summary dd,
  .settings-screen__information-list dd {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-primary);
    word-break: break-word;
  }

  .settings-screen__information {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.4rem;
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
    border: 1px solid var(--settings-dialog-border);
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
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
    color: var(--settings-error-color);
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
