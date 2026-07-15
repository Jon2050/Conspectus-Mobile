<!-- Coordinates shell routing, startup auth hydration, and shared end-of-page deployment footer behavior. -->
<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import { get, type Readable } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import type { DriveItemBinding } from '@graph';
  import {
    appSelectedDriveItemBindingStore,
    appNetworkStateStore,
    appSyncStateStore,
    type NetworkStateStore,
    type SyncStateStore,
  } from '@shared';
  import LoadingPlaceholder from './components/LoadingPlaceholder.svelte';
  import DeploymentInfoFooter from './components/DeploymentInfoFooter.svelte';
  import ProgressIndicator from './components/ProgressIndicator.svelte';
  import AccountsRoute from './routes/AccountsRoute.svelte';
  import TransfersRoute from './routes/TransfersRoute.svelte';
  import AddRoute from './routes/AddRoute.svelte';
  import SettingsRoute from './routes/SettingsRoute.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import ServiceWorkerUpdateBanner from './components/ServiceWorkerUpdateBanner.svelte';
  import {
    appServiceWorkerUpdateController,
    type ServiceWorkerUpdateController,
  } from './serviceWorkerUpdateController';
  import { initializeAppAuthClient, resolveAppAuthClient } from './authClientResolver';
  import { resolveAppCacheStore } from './cacheStoreResolver';
  import { createCachedDatabaseSnapshotService } from './cachedDatabaseSnapshotService';
  import { resolveAppGraphClient } from './graphClientResolver';
  import { resolveAppDbRuntime } from './dbRuntimeResolver';
  import {
    APP_ROUTES,
    createHashRouteStore,
    DEFAULT_ROUTE,
    toRouteHash,
    type AppRouteKey,
  } from './hashRouting';
  import {
    createStartupFreshnessService,
    type StartupFreshnessDecision,
  } from './startupFreshnessService';
  import {
    applyStartupFreshnessDecision,
    applyStartupDbRuntimeError,
    applyUnexpectedStartupSyncError,
    beginStartupSync,
    updateStartupSyncProgress,
  } from './startupSyncStateController';
  import { syncDbRuntimeForStartupDecision } from './startupDbRuntimeSync';
  import { resolveAppStartupIsOnline } from './startupNetworkStateResolver';
  import { syncSelectedDriveItemBindingStoreAtStartup } from './startupBindingSync';
  import { resolveAppSnapshotValidator } from './snapshotValidatorResolver';
  import { createMissingFileRecoveryService } from './missingFileRecoveryService';
  import {
    createInitialFormFields,
    type AddTransferFormFields,
  } from './routes/addTransferFormState';
  import {
    createAddTransferSaveController,
    type AddTransferSaveController,
    type AddTransferSaveState,
  } from './routes/addTransferSaveController';

  export let routeStore: Readable<AppRouteKey> = createHashRouteStore();
  export let syncStateStore: SyncStateStore = appSyncStateStore;
  export let networkStateStore: NetworkStateStore = appNetworkStateStore;
  export let serviceWorkerUpdateController: ServiceWorkerUpdateController =
    appServiceWorkerUpdateController;
  export let addTransferSaveController: AddTransferSaveController =
    createAddTransferSaveController();
  export let loadingDelayMs = 160;
  export let showLoadingPlaceholder = true;

  const FOOTER_VISIBILITY_THRESHOLD_PX = 24;
  // Keep the footer visible until the user scrolls far enough away from the end of the page.
  const FOOTER_VISIBILITY_HYSTERESIS_PX = 48;

  let currentRoute: AppRouteKey = DEFAULT_ROUTE;
  let addTransferFields: AddTransferFormFields = createInitialFormFields();
  let addTransferSaveState: AddTransferSaveState = addTransferSaveController.getState();
  let selectedBinding: DriveItemBinding | null = get(appSelectedDriveItemBindingStore);
  let addTransferHasLoadedDatabase = false;
  let appContentElement: HTMLElement | null = null;
  let appContentPageElement: HTMLDivElement | null = null;
  let footerIsVisible = true;
  let appShellIsMounted = false;
  let selectedBindingHasEmitted = false;
  let hasPerformedInitialSync = false;
  let dataRoutesAwaitInitialSync = false;
  let currentSyncId = 0;
  let footerVisibilityTrackingIsActive = false;
  let lastRenderedRoute: AppRouteKey | null = null;
  let forceRefreshIsRunning = false;
  let authRecoveryIsPending = false;
  let authRecoveryError: string | null = null;
  let bindingRepairPersistenceIsRunning = false;
  let stopFooterVisibilityTracking = (): void => {};
  const navIconBaseUrl = import.meta.env.BASE_URL;
  const unsubscribe = routeStore.subscribe((route) => {
    currentRoute = route;
  });
  const unsubscribeAddTransferSaveController = addTransferSaveController.subscribe((state) => {
    const wasSaved = addTransferSaveState.phase === 'saved';
    addTransferSaveState = state;
    if (state.phase === 'saved' && !wasSaved) {
      addTransferFields = createInitialFormFields();
    }
  });

  $: pendingTransferNeedsAttention =
    addTransferSaveState.phase === 'upload_failed' ||
    addTransferSaveState.phase === 'conflict' ||
    addTransferSaveState.phase === 'conflict_syncing';
  $: pendingTransferIsConflict =
    addTransferSaveState.phase === 'conflict' || addTransferSaveState.phase === 'conflict_syncing';
  $: pendingTransferIsOffline = !$networkStateStore;
  $: startupSyncIsActive = $syncStateStore.state === 'syncing' && $syncStateStore.branch === null;
  $: staleTokenRecoveryIsRequired =
    $syncStateStore.state === 'error' && $syncStateStore.branch === 'online_auth_expired';
  $: missingFileRecoveryIsRequired =
    $syncStateStore.state === 'error' && $syncStateStore.branch === 'online_file_missing';
  $: if (!staleTokenRecoveryIsRequired && authRecoveryError !== null) {
    authRecoveryError = null;
  }
  $: startupSyncBlocksDataRoute =
    dataRoutesAwaitInitialSync &&
    startupSyncIsActive &&
    (currentRoute === 'accounts' || currentRoute === 'transfers');

  const openPendingTransfer = (): void => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/add';
    }
  };

  const openMissingFileRecovery = (): void => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/settings';
    }
  };

  const toRecoveryErrorMessage = (error: unknown): string => {
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }

    return $_('appShell.reauthenticationFailed');
  };

  const requestStaleTokenRecovery = async (): Promise<void> => {
    if (authRecoveryIsPending) {
      return;
    }

    authRecoveryIsPending = true;
    authRecoveryError = null;

    try {
      const redirectStartPage = new URL(toRouteHash(currentRoute), window.location.href).toString();
      await resolveAppAuthClient().reauthenticate(redirectStartPage);
    } catch (error) {
      authRecoveryError = toRecoveryErrorMessage(error);
    } finally {
      authRecoveryIsPending = false;
    }
  };

  const retryPendingTransfer = (): void => {
    void addTransferSaveController.retry($_, pendingTransferIsOffline);
  };

  const recoverPendingTransferConflict = (): void => {
    void addTransferSaveController.resolveConflict($_, pendingTransferIsOffline);
  };

  $: if (selectedBinding === null || $syncStateStore.state === 'idle') {
    addTransferHasLoadedDatabase = false;
  } else if (resolveAppDbRuntime().isOpen()) {
    addTransferHasLoadedDatabase = true;
  }

  $: addTransferDatabaseIsReady =
    selectedBinding !== null && addTransferHasLoadedDatabase && $syncStateStore.state !== 'idle';

  const resolveNavIconUrl = (iconPath: string): string => `${navIconBaseUrl}${iconPath}`;

  const performSync = async (
    binding: DriveItemBinding | null,
    isInitialSync = false,
    mode: 'reuse_if_current' | 'force_download' = 'reuse_if_current',
  ): Promise<void> => {
    const syncId = ++currentSyncId;
    dataRoutesAwaitInitialSync = isInitialSync;
    syncStateStore.reset();
    const dbRuntime = resolveAppDbRuntime();

    if (binding === null) {
      dbRuntime.close();
      return;
    }

    const startupIsOnline = resolveAppStartupIsOnline();
    if (startupIsOnline) {
      beginStartupSync(syncStateStore);
    }

    try {
      const graphClient = resolveAppGraphClient();
      const cacheStore = resolveAppCacheStore();
      const startupFreshnessService = createStartupFreshnessService(
        graphClient,
        cacheStore,
        createCachedDatabaseSnapshotService(graphClient, cacheStore, {
          snapshotValidator: resolveAppSnapshotValidator(),
        }),
        {
          missingFileRecovery: createMissingFileRecoveryService(graphClient),
        },
      );
      const decision = await startupFreshnessService.resolve(
        binding,
        startupIsOnline,
        (loadedBytes, totalBytes) => {
          if (syncId === currentSyncId) {
            updateStartupSyncProgress(syncStateStore, loadedBytes, totalBytes);
          }
        },
        mode,
      );

      if (!appShellIsMounted || syncId !== currentSyncId) {
        return;
      }

      try {
        const dbSyncResult = await syncDbRuntimeForStartupDecision(dbRuntime, decision, () => {
          return appShellIsMounted && syncId === currentSyncId;
        });

        if (dbSyncResult === 'superseded') {
          return;
        }
      } catch (error) {
        console.warn('Opening cached OneDrive database snapshot failed.', error);
        applyStartupDbRuntimeError(syncStateStore, error);
        return;
      }

      if (decision.kind === 'ready' && decision.recoveredBinding !== undefined) {
        bindingRepairPersistenceIsRunning = true;
        try {
          appSelectedDriveItemBindingStore.setBinding(decision.recoveredBinding);
        } finally {
          bindingRepairPersistenceIsRunning = false;
        }
      }

      applyStartupFreshnessDecision(syncStateStore, decision);
      logStartupFreshnessDecision(decision, binding?.name ?? null);
    } catch (error) {
      if (!appShellIsMounted || syncId !== currentSyncId) {
        return;
      }

      console.warn('Startup freshness resolution failed unexpectedly.', error);
      dbRuntime.close();
      applyUnexpectedStartupSyncError(
        syncStateStore,
        'Startup sync failed unexpectedly. Check the browser console and retry.',
      );
    }
  };

  const requestForceRefresh = async (): Promise<void> => {
    if (forceRefreshIsRunning || get(syncStateStore).state === 'syncing') {
      return;
    }

    forceRefreshIsRunning = true;
    try {
      await performSync(get(appSelectedDriveItemBindingStore), false, 'force_download');
    } finally {
      forceRefreshIsRunning = false;
    }
  };

  const unsubscribeSelectedBinding = appSelectedDriveItemBindingStore.subscribe((binding) => {
    selectedBinding = binding;
    if (!selectedBindingHasEmitted) {
      selectedBindingHasEmitted = true;
      return;
    }

    if (bindingRepairPersistenceIsRunning) {
      return;
    }

    if (hasPerformedInitialSync) {
      void performSync(binding);
    } else {
      syncStateStore.reset();
    }
  });

  let foregroundSyncIsQueued = false;

  const flushQueuedForegroundSync = (): void => {
    foregroundSyncIsQueued = false;

    queueMicrotask(() => {
      if (
        !appShellIsMounted ||
        document.visibilityState !== 'visible' ||
        get(syncStateStore).state === 'syncing'
      ) {
        return;
      }

      void performSync(get(appSelectedDriveItemBindingStore));
    });
  };

  const unsubscribeQueuedForegroundSync = syncStateStore.subscribe((syncSnapshot) => {
    if (!foregroundSyncIsQueued || syncSnapshot.state === 'syncing') {
      return;
    }

    if (syncSnapshot.state === 'synced') {
      flushQueuedForegroundSync();
      return;
    }

    foregroundSyncIsQueued = false;
  });

  const handleDocumentVisibilityChange = (): void => {
    if (!hasPerformedInitialSync || document.visibilityState !== 'visible') {
      return;
    }

    if (get(syncStateStore).state === 'syncing') {
      foregroundSyncIsQueued = true;
      return;
    }

    void performSync(get(appSelectedDriveItemBindingStore));
  };

  const logStartupFreshnessDecision = (
    decision: StartupFreshnessDecision,
    bindingName: string | null,
  ): void => {
    if (!import.meta.env.DEV) {
      return;
    }

    const logDetails = {
      branch: decision.branch,
      syncState: decision.syncState,
      bindingName,
      hasSnapshot: decision.snapshot !== null,
      failureCode: decision.failure?.code ?? null,
    };

    if (decision.kind === 'error' || decision.failure !== null) {
      console.warn('Startup freshness decision completed with fallback or error.', logDetails);
      return;
    }

    console.info('Startup freshness decision completed.', logDetails);
  };

  const updateFooterVisibility = (): void => {
    if (appContentElement === null) {
      footerIsVisible = true;
      return;
    }

    const { clientHeight, scrollHeight, scrollTop } = appContentElement;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (scrollHeight <= clientHeight + FOOTER_VISIBILITY_THRESHOLD_PX) {
      footerIsVisible = true;
      return;
    }

    if (footerIsVisible) {
      footerIsVisible =
        distanceFromBottom <= FOOTER_VISIBILITY_THRESHOLD_PX + FOOTER_VISIBILITY_HYSTERESIS_PX;
      return;
    }

    footerIsVisible = distanceFromBottom <= FOOTER_VISIBILITY_THRESHOLD_PX;
  };

  const disconnectFooterVisibilityTracking = (): void => {
    stopFooterVisibilityTracking();
    stopFooterVisibilityTracking = (): void => {};
    footerVisibilityTrackingIsActive = false;
  };

  const startFooterVisibilityTracking = async (): Promise<void> => {
    disconnectFooterVisibilityTracking();
    await tick();

    if (showLoadingPlaceholder || appContentElement === null) {
      footerIsVisible = false;
      return;
    }

    const handleScroll = (): void => {
      updateFooterVisibility();
    };
    const handleViewportResize = (): void => {
      updateFooterVisibility();
    };
    let resizeObserver: ResizeObserver | null = null;

    appContentElement.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleViewportResize);

    if (typeof ResizeObserver === 'function' && appContentPageElement !== null) {
      resizeObserver = new ResizeObserver(() => {
        updateFooterVisibility();
      });
      resizeObserver.observe(appContentElement);
      resizeObserver.observe(appContentPageElement);
    }

    stopFooterVisibilityTracking = (): void => {
      appContentElement?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleViewportResize);
      resizeObserver?.disconnect();
      resizeObserver = null;
    };
    footerVisibilityTrackingIsActive = true;
    updateFooterVisibility();
  };

  onMount(() => {
    appShellIsMounted = true;
    let isMounted = true;
    syncStateStore.reset();
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange);

    void (async () => {
      try {
        await initializeAppAuthClient();
        const authSession = resolveAppAuthClient().getSession();
        syncSelectedDriveItemBindingStoreAtStartup(authSession, appSelectedDriveItemBindingStore);
      } catch (error) {
        console.warn('Auth bootstrap initialization failed at app-shell startup.', error);
        appSelectedDriveItemBindingStore.setActiveAccountId(null);
      }

      if (!isMounted) {
        return;
      }

      hasPerformedInitialSync = true;
      const binding = get(appSelectedDriveItemBindingStore);
      void performSync(binding, true);
    })();

    let timerId: number | null = null;
    if (!showLoadingPlaceholder || loadingDelayMs <= 0) {
      showLoadingPlaceholder = false;
    } else {
      timerId = window.setTimeout(() => {
        showLoadingPlaceholder = false;
      }, loadingDelayMs);
    }

    return () => {
      isMounted = false;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
      disconnectFooterVisibilityTracking();
    };
  });

  afterUpdate(() => {
    if (!appShellIsMounted || showLoadingPlaceholder) {
      footerIsVisible = false;
      return;
    }

    if (!footerVisibilityTrackingIsActive) {
      void startFooterVisibilityTracking();
    }

    if (appContentElement !== null && lastRenderedRoute !== currentRoute) {
      lastRenderedRoute = currentRoute;
      appContentElement.scrollTop = 0;
      updateFooterVisibility();
    }
  });

  onDestroy(() => {
    unsubscribe();
    unsubscribeAddTransferSaveController();
    unsubscribeSelectedBinding();
    unsubscribeQueuedForegroundSync();
    resolveAppDbRuntime().close();
    disconnectFooterVisibilityTracking();
  });
</script>

<div class="app-shell" data-testid="app-shell">
  <header class="app-header">
    <h1>{$_('appShell.title')}</h1>
  </header>

  <ServiceWorkerUpdateBanner updateController={serviceWorkerUpdateController} />

  {#if staleTokenRecoveryIsRequired}
    <section class="auth-recovery" role="alert" data-testid="stale-token-recovery">
      <div>
        <h2>{$_('appShell.sessionExpiredTitle')}</h2>
        <p>{$syncStateStore.message}</p>
        {#if authRecoveryError !== null}
          <p class="auth-recovery__error" data-testid="stale-token-recovery-error">
            {authRecoveryError}
          </p>
        {/if}
      </div>
      <button
        type="button"
        class="app-button app-button--primary"
        data-testid="stale-token-recovery-button"
        aria-busy={authRecoveryIsPending}
        disabled={authRecoveryIsPending}
        on:click={() => void requestStaleTokenRecovery()}
      >
        {authRecoveryIsPending ? $_('appShell.reauthenticating') : $_('appShell.signInAgain')}
      </button>
    </section>
  {/if}

  {#if missingFileRecoveryIsRequired}
    <section class="file-recovery" role="alert" data-testid="missing-file-recovery">
      <div>
        <h2>{$_('appShell.missingFileTitle')}</h2>
        <p>{$_('appShell.missingFileDescription')}</p>
      </div>
      <button
        type="button"
        class="app-button app-button--primary"
        data-testid="missing-file-recovery-button"
        on:click={openMissingFileRecovery}
      >
        {$_('appShell.selectAnotherFile')}
      </button>
    </section>
  {/if}

  {#if pendingTransferNeedsAttention}
    <section
      class="pending-transfer-sync"
      role={pendingTransferIsConflict ? 'alert' : 'status'}
      data-testid="pending-transfer-sync"
    >
      <div>
        <h2>{$_('addTransfer.save.pendingTitle')}</h2>
        <p>
          {pendingTransferIsConflict
            ? $_('addTransfer.save.pendingConflictDescription')
            : $_('addTransfer.save.pendingRetryDescription')}
        </p>
      </div>
      <div class="pending-transfer-sync__actions">
        <button
          type="button"
          class="app-button app-button--secondary"
          data-testid="pending-transfer-review"
          on:click={openPendingTransfer}
        >
          {$_('addTransfer.save.pendingReview')}
        </button>
        {#if pendingTransferIsConflict}
          <button
            type="button"
            class="app-button app-button--primary"
            data-testid="pending-transfer-recover"
            disabled={addTransferSaveState.phase === 'conflict_syncing' || pendingTransferIsOffline}
            on:click={recoverPendingTransferConflict}
          >
            {addTransferSaveState.phase === 'conflict_syncing'
              ? $_('addTransfer.save.conflictSyncingButton')
              : $_('addTransfer.save.conflictAction')}
          </button>
        {:else}
          <button
            type="button"
            class="app-button app-button--primary"
            data-testid="pending-transfer-retry"
            disabled={pendingTransferIsOffline}
            on:click={retryPendingTransfer}
          >
            {$_('addTransfer.save.retry')}
          </button>
        {/if}
      </div>
    </section>
  {/if}

  {#if startupSyncIsActive}
    <section class="startup-sync-progress" data-testid="startup-sync-progress">
      <ProgressIndicator
        loaded={$syncStateStore.progress?.loaded ?? 0}
        total={$syncStateStore.progress?.total ?? null}
        kind={$syncStateStore.progress?.kind ?? 'download'}
        statusText={$syncStateStore.progress === null ? $syncStateStore.message : null}
      />
    </section>
  {/if}

  <main
    class="app-content"
    data-testid="app-shell-content"
    aria-live="polite"
    bind:this={appContentElement}
  >
    <div class="app-content__page" bind:this={appContentPageElement}>
      {#if showLoadingPlaceholder}
        <LoadingPlaceholder />
      {:else if currentRoute === 'accounts'}
        {#if !startupSyncBlocksDataRoute}
          <AccountsRoute {syncStateStore} />
        {/if}
      {:else if currentRoute === 'transfers'}
        {#if !startupSyncBlocksDataRoute}
          <TransfersRoute {syncStateStore} />
        {/if}
      {:else if currentRoute === 'add'}
        <AddRoute
          bind:fields={addTransferFields}
          saveController={addTransferSaveController}
          {networkStateStore}
          canOpenPanel={addTransferDatabaseIsReady}
        />
      {:else}
        <SettingsRoute {syncStateStore} onForceRefresh={requestForceRefresh} />
      {/if}
    </div>
  </main>

  <div
    class="app-shell__bottom"
    class:app-shell__bottom--with-safe-area={showLoadingPlaceholder || !footerIsVisible}
    data-testid="app-shell-bottom"
  >
    <nav class="app-nav" aria-label={$_('nav.primary')}>
      {#each APP_ROUTES as route (route.key)}
        <a
          class="app-nav__item"
          class:is-active={route.key === currentRoute}
          href={route.hash}
          aria-current={route.key === currentRoute ? 'page' : undefined}
        >
          <img
            class="app-nav__icon"
            src={resolveNavIconUrl(route.icon)}
            alt=""
            aria-hidden="true"
            width="28"
            height="28"
            data-testid={`app-nav-icon-${route.key}`}
          />
          <span class="app-nav__label">{$_('nav.' + route.key)}</span>
        </a>
      {/each}
    </nav>

    {#if !showLoadingPlaceholder}
      <DeploymentInfoFooter isVisible={footerIsVisible} />
    {/if}
  </div>

  <style>
    .auth-recovery,
    .pending-transfer-sync,
    .file-recovery {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.875rem 1rem;
      background: var(--surface-strong);
      border-bottom: 1px solid var(--border);
    }

    .auth-recovery {
      background: color-mix(in srgb, var(--negative) 10%, var(--surface-strong));
      border-bottom: 1px solid color-mix(in srgb, var(--negative) 24%, var(--border));
    }

    .file-recovery {
      background: color-mix(in srgb, var(--accent) 12%, var(--surface-strong));
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    }

    .auth-recovery h2,
    .auth-recovery p,
    .pending-transfer-sync h2,
    .pending-transfer-sync p,
    .file-recovery h2,
    .file-recovery p {
      margin: 0;
    }

    .auth-recovery h2 {
      font-size: 1rem;
    }

    .auth-recovery__error {
      color: color-mix(in srgb, var(--negative) 72%, var(--text-primary));
    }

    .pending-transfer-sync h2,
    .file-recovery h2 {
      font-size: 1rem;
    }

    .pending-transfer-sync p {
      margin-top: 0.25rem;
      color: var(--text-secondary);
    }

    .pending-transfer-sync__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    @media (max-width: 36rem) {
      .auth-recovery,
      .pending-transfer-sync,
      .file-recovery {
        align-items: stretch;
        flex-direction: column;
      }

      .auth-recovery :global(.app-button),
      .file-recovery :global(.app-button) {
        width: 100%;
      }

      .pending-transfer-sync__actions {
        justify-content: stretch;
      }

      .pending-transfer-sync__actions :global(.app-button) {
        flex: 1;
      }
    }
  </style>

  <ToastContainer />
</div>

<style>
  .startup-sync-progress {
    margin: 0 1rem;
    padding: 0.85rem 1rem;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    background: color-mix(in srgb, var(--accent) 12%, white);
    color: color-mix(in srgb, var(--accent) 68%, black);
  }
</style>
