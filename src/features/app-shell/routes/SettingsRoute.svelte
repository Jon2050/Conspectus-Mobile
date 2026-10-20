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
  import { presentOperationFailure } from '../failurePresentation';
  import SettingsDatabaseBrowser from './SettingsDatabaseBrowser.svelte';
  import SettingsSafetySection from './SettingsSafetySection.svelte';
  import SettingsBuildInformation from './SettingsBuildInformation.svelte';
  import './settings.css';
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
  import SettingsOpenRouterSection from './SettingsOpenRouterSection.svelte';
  import { createSettingsOpenRouterController } from './settingsOpenRouterController';

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
      return $_(presentOperationFailure(nextState.error).messageKey);
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
      return $_(presentOperationFailure(nextState.error).messageKey);
    }

    if (nextState.selectedBinding !== null) {
      return $_('settings.db.status.selected');
    }

    if (nextState.hasLoaded) {
      return $_('settings.db.status.choose');
    }

    return $_('settings.db.status.notSelected');
  };

  const authController = createSettingsAuthController(authClient);
  const openRouterController = createSettingsOpenRouterController();
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
      openRouterController.clearAfterLocalReset();
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
      void openRouterController.activateAccount(nextAccountId);
    }

    if (!nextState.session.isAuthenticated) {
      appSelectedDriveItemBindingStore.setActiveAccountId(null);
      localDataController.cancelReset();
      void openRouterController.activateAccount(null);
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
      const metadata =
        cacheStore.readMetadata !== undefined
          ? await cacheStore.readMetadata(binding)
          : ((await cacheStore.readSnapshot(binding))?.metadata ?? null);
      if (requestId === syncMetadataRequestId) {
        lastSyncAtIso = metadata?.lastSyncAtIso ?? null;
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
    openRouterController.dispose();
  });
</script>

<section class="placeholder-screen settings-screen" data-testid="route-settings">
  <h2>{$_('settings.title')}</h2>
  <p>{$_('settings.description')}</p>

  <SettingsSafetySection />

  <p
    class="settings-screen__auth-status"
    data-testid="auth-status-message"
    aria-live="polite"
    role={state.error === null ? undefined : 'alert'}
  >
    {authStatusMessage}
  </p>

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

    <SettingsOpenRouterSection controller={openRouterController} />

    <h3 class="settings-screen__subheading">{$_('settings.db.heading')}</h3>
    <p
      class="settings-screen__binding-status"
      data-testid="binding-status-message"
      role={bindingState.error === null ? undefined : 'alert'}
      aria-live="polite"
    >
      {bindingStatusMessage}
    </p>

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
          {$_('sync.failure.cache')}
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
      <SettingsDatabaseBrowser {bindingState} {handleOpenFolderClick} {handleSelectFileClick} />
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

  <SettingsBuildInformation {buildInfo} />
</section>
