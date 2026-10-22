<!-- Coordinates shell routing, startup auth hydration, and shared end-of-page deployment footer behavior. -->
<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import { get, type Readable } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import type { DriveItemBinding } from '@graph';
  import { appTransferMonthQueryService, type TransferRecord } from '@db';
  import EditTransferSheet from './routes/EditTransferSheet.svelte';
  import {
    createEditTransferController,
    type EditTransferController,
  } from './routes/editTransferController';
  import type { TransferCommitState } from './transferCommitController';
  import {
    measurePhase,
    appSelectedDriveItemBindingStore,
    appNetworkStateStore,
    appSyncStateStore,
    type NetworkStateStore,
    type SyncStateStore,
  } from '@shared';
  import { appDatabaseSession } from './databaseSession';
  import { createDatabaseRefreshController } from './databaseRefreshController';
  import { presentOperationFailure } from './failurePresentation';
  import LoadingPlaceholder from './components/LoadingPlaceholder.svelte';
  import DeploymentInfoFooter from './components/DeploymentInfoFooter.svelte';
  import ProgressIndicator from './components/ProgressIndicator.svelte';
  import AccountsRoute from './routes/AccountsRoute.svelte';
  import TransfersRoute from './routes/TransfersRoute.svelte';
  import AddRoute from './routes/AddRoute.svelte';
  import type SettingsRoute from './routes/SettingsRoute.svelte';
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
    beginStartupSync,
    updateStartupSyncProgress,
  } from './startupSyncStateController';
  import { resolveAppStartupIsOnline } from './startupNetworkStateResolver';
  import { syncSelectedDriveItemBindingStoreAtStartup } from './startupBindingSync';
  import { resolveAppSnapshotValidator } from './snapshotValidatorResolver';
  import { createMissingFileRecoveryService } from './missingFileRecoveryService';
  import {
    createInitialFormFields,
    type AddTransferFormFields,
  } from '../transfers/addTransferFormState';
  import {
    browserReceiptImageCodec,
    createReceiptAnalysisController,
    createReceiptCaptureController,
    createReceiptImageNormalizer,
    createReceiptTransferPreparationController,
    openRouterSettingsStore,
    toStoredReadyOpenRouterReceiptConfiguration,
    type ReceiptAnalysisController,
    type ReceiptCaptureController,
    type ReceiptTransferPreparationController,
  } from '../receipt';
  import {
    createAddTransferSaveController,
    type AddTransferSaveController,
    type AddTransferSaveState,
  } from './routes/addTransferSaveController';
  import {
    createReceiptTransferCommitController,
    type ReceiptTransferCommitController,
    type ReceiptTransferCommitState,
  } from './receiptTransferCommitController';

  let SettingsComponent: typeof SettingsRoute | null = null;
  let settingsLoad: Promise<void> | null = null;
  let settingsLoadFailed = false;
  const loadSettings = (): void => {
    settingsLoadFailed = false;
    settingsLoad = import('./routes/SettingsRoute.svelte')
      .then((module) => {
        SettingsComponent = module.default;
      })
      .catch(() => {
        settingsLoadFailed = true;
        settingsLoad = null;
      });
  };

  export let routeStore: Readable<AppRouteKey> = createHashRouteStore();
  export let syncStateStore: SyncStateStore = appSyncStateStore;
  export let networkStateStore: NetworkStateStore = appNetworkStateStore;
  export let serviceWorkerUpdateController: ServiceWorkerUpdateController =
    appServiceWorkerUpdateController;
  export let addTransferSaveController: AddTransferSaveController =
    createAddTransferSaveController();
  export let receiptCaptureController: ReceiptCaptureController | null = null;
  export let receiptAnalysisController: ReceiptAnalysisController | null = null;
  export let receiptPreparationController: ReceiptTransferPreparationController =
    createReceiptTransferPreparationController();
  export let receiptCommitController: ReceiptTransferCommitController =
    createReceiptTransferCommitController();
  export let showLoadingPlaceholder = true;

  let editedTransfer: TransferRecord | null = null;
  let editController: EditTransferController | null = null;
  let editState: TransferCommitState | null = null;
  let editIsOpen = false;
  let unsubscribeEdit: (() => void) | null = null;
  const openTransferEditor = (transferId: number, day: number): void => {
    if (
      editController !== null &&
      editState !== null &&
      !['idle', 'failed', 'saved', 'invalidated', 'remote_commit_recovery_failed'].includes(
        editState.phase,
      )
    ) {
      editIsOpen = true;
      return;
    }
    if (!appDatabaseSession.isReadable()) return;
    const transfer = appTransferMonthQueryService
      .listTransfersByMonth(day)
      .find((item) => item.transferId === transferId);
    if (transfer === undefined) return;
    unsubscribeEdit?.();
    editedTransfer = transfer;
    editController = createEditTransferController(transfer);
    unsubscribeEdit = editController.subscribe((state) => {
      editState = state;
      if (state.phase === 'saved') editIsOpen = false;
    });
    editIsOpen = true;
  };

  let currentRoute: AppRouteKey = DEFAULT_ROUTE;
  let addTransferFields: AddTransferFormFields = createInitialFormFields();
  let addTransferSaveState: AddTransferSaveState = addTransferSaveController.getState();
  let receiptCommitState: ReceiptTransferCommitState = receiptCommitController.getState();
  let selectedBinding: DriveItemBinding | null = get(appSelectedDriveItemBindingStore);
  let appContentElement: HTMLElement | null = null;
  let appShellIsMounted = false;
  let selectedBindingHasEmitted = false;
  let hasPerformedInitialSync = false;
  let lastRenderedRoute: AppRouteKey | null = null;
  let forceRefreshIsRunning = false;
  let authRecoveryIsPending = false;
  let authRecoveryError: string | null = null;
  let bindingRepairPersistenceIsRunning = false;
  const ownedReceiptAnalysisController =
    receiptCaptureController === null && receiptAnalysisController === null
      ? createReceiptAnalysisController()
      : null;
  const effectiveReceiptAnalysisController =
    receiptAnalysisController ?? ownedReceiptAnalysisController;
  const ownedReceiptCaptureController =
    receiptCaptureController === null && effectiveReceiptAnalysisController !== null
      ? createReceiptCaptureController({
          normalizer: createReceiptImageNormalizer(browserReceiptImageCodec),
          resolveConfiguration: () => {
            const accountId = resolveAppAuthClient().getSession().account?.homeAccountId ?? null;
            if (accountId === null) {
              return null;
            }
            const settings = openRouterSettingsStore.read(accountId);
            return settings === null ? null : toStoredReadyOpenRouterReceiptConfiguration(settings);
          },
          stageOneStarter: effectiveReceiptAnalysisController,
        })
      : null;
  const effectiveReceiptCaptureController =
    receiptCaptureController ?? ownedReceiptCaptureController;
  const navIconBaseUrl = import.meta.env.BASE_URL;
  const unsubscribe = routeStore.subscribe((route) => {
    if (currentRoute === 'add' && route !== 'add') {
      effectiveReceiptCaptureController?.cancel();
      effectiveReceiptAnalysisController?.reset();
      receiptPreparationController.reset();
      if (receiptCommitController.getState().phase === 'saved') {
        receiptCommitController.reset();
      }
    }
    currentRoute = route;
    if (
      route === 'settings' &&
      SettingsComponent === null &&
      settingsLoad === null &&
      !settingsLoadFailed
    )
      loadSettings();
  });
  const unsubscribeAddTransferSaveController = addTransferSaveController.subscribe((state) => {
    const wasSaved = addTransferSaveState.phase === 'saved';
    addTransferSaveState = state;
    if (state.phase === 'saved' && !wasSaved) {
      addTransferFields = createInitialFormFields();
    }
  });
  const unsubscribeReceiptCommitController = receiptCommitController.subscribe((state) => {
    receiptCommitState = state;
    if (state.phase === 'saved' && currentRoute !== 'add') {
      receiptCommitController.reset();
    }
  });

  $: pendingTransferNeedsAttention =
    addTransferSaveState.phase === 'upload_failed' ||
    addTransferSaveState.phase === 'conflict' ||
    addTransferSaveState.phase === 'conflict_syncing';
  $: pendingTransferIsConflict =
    addTransferSaveState.phase === 'conflict' || addTransferSaveState.phase === 'conflict_syncing';
  $: pendingTransferIsOffline = !$networkStateStore;
  $: pendingReceiptNeedsAttention = [
    'upload_failed',
    'conflict',
    'conflict_ready',
    'local_commit_recovery_failed',
    'remote_commit_recovery_failed',
    'invalidated',
  ].includes(receiptCommitState.phase);
  $: startupSyncIsActive = $syncStateStore.state === 'syncing' && $syncStateStore.branch === null;
  $: staleTokenRecoveryIsRequired =
    $syncStateStore.state === 'error' && $syncStateStore.branch === 'online_auth_expired';
  $: missingFileRecoveryIsRequired =
    $syncStateStore.state === 'error' && $syncStateStore.branch === 'online_file_missing';
  $: refreshHasFailed =
    $syncStateStore.state === 'error' &&
    [
      'offline_unsupported',
      'online_metadata_failed',
      'online_download_failed',
      'online_auth_expired',
      'online_file_missing',
      'cache_unavailable',
      'database_invalid',
      'database_changed',
      'permission_denied',
      'db_runtime_open_failed',
    ].includes($syncStateStore.branch ?? '');
  $: if (!staleTokenRecoveryIsRequired && authRecoveryError !== null) {
    authRecoveryError = null;
  }
  const openPendingTransfer = (): void => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/add';
    }
  };

  const openPendingReceipt = (): void => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/add';
    }
  };

  const resolveReceiptCommitIdentity = () => {
    const session = resolveAppAuthClient().getSession();
    const binding = get(appSelectedDriveItemBindingStore);
    return {
      isAuthenticated: session.isAuthenticated && session.account !== null,
      isVerifiedCurrent: binding !== null && appDatabaseSession.isWritable(),
      contextKey:
        session.account === null || binding === null
          ? null
          : `${session.account.homeAccountId}|${binding.driveId}|${binding.itemId}`,
    };
  };

  const openMissingFileRecovery = (): void => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#/settings';
    }
  };

  const toRecoveryErrorMessage = (error: unknown): string =>
    $_(presentOperationFailure(error).messageKey);

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

  const attemptAutomaticTokenRecovery = async (): Promise<void> => {
    if (authRecoveryIsPending) {
      return;
    }

    authRecoveryIsPending = true;
    authRecoveryError = null;

    try {
      const redirectStartPage = new URL(toRouteHash(currentRoute), window.location.href).toString();
      await resolveAppAuthClient().attemptSessionResume(redirectStartPage);
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

  $: addTransferDatabaseIsReady =
    selectedBinding !== null &&
    $syncStateStore.state !== 'idle' &&
    !refreshHasFailed &&
    (appDatabaseSession.hasRuntime() ||
      !['idle', 'invalidated'].includes(addTransferSaveState.phase) ||
      !['idle', 'invalidated'].includes(receiptCommitState.phase));

  const abandonReceiptContext = (): void => {
    effectiveReceiptCaptureController?.cancel();
    effectiveReceiptAnalysisController?.reset();
    receiptPreparationController.reset();
    receiptCommitController.invalidate();
  };
  const resolveNavIconUrl = (iconPath: string): string => `${navIconBaseUrl}${iconPath}`;
  const refreshController = createDatabaseRefreshController({
    session: appDatabaseSession,
    runtime: resolveAppDbRuntime,
    isOnline: resolveAppStartupIsOnline,
    freshness: () => {
      const graph = resolveAppGraphClient();
      const cache = resolveAppCacheStore();
      const validator = resolveAppSnapshotValidator();
      return createStartupFreshnessService(
        graph,
        cache,
        createCachedDatabaseSnapshotService(graph, cache, { snapshotValidator: validator }),
        {
          missingFileRecovery: createMissingFileRecoveryService(graph),
          validateCachedSnapshot: (bytes, signal) => validator.validate(bytes, signal),
        },
      );
    },
    onStart: () => beginStartupSync(syncStateStore),
    onProgress: (loaded, total) => updateStartupSyncProgress(syncStateStore, loaded, total),
    onReplace: abandonReceiptContext,
    onRecoveredBinding: (binding) => {
      bindingRepairPersistenceIsRunning = true;
      try {
        appSelectedDriveItemBindingStore.setBinding(binding);
      } finally {
        bindingRepairPersistenceIsRunning = false;
      }
    },
    onDecision: (decision) => {
      applyStartupFreshnessDecision(syncStateStore, decision);
      logStartupFreshnessDecision(decision, selectedBinding?.name ?? null);
      if (decision.branch === 'online_auth_expired') void attemptAutomaticTokenRecovery();
    },
    onError: (error) => {
      console.warn('Database refresh failed.', error);
      applyStartupDbRuntimeError(syncStateStore, error);
    },
  });
  const performSync = (
    binding: DriveItemBinding | null,
    mode: 'reuse_if_current' | 'force_download' = 'reuse_if_current',
  ) => refreshController.refresh(binding, mode);

  const requestForceRefresh = async (): Promise<void> => {
    if (forceRefreshIsRunning || get(syncStateStore).state === 'syncing') {
      return;
    }

    forceRefreshIsRunning = true;
    try {
      await performSync(get(appSelectedDriveItemBindingStore), 'force_download');
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

    if (bindingRepairPersistenceIsRunning) return;
    refreshController.cancel();
    abandonReceiptContext();
    editController?.invalidate();
    editIsOpen = false;
    addTransferSaveController.invalidate?.();
    appDatabaseSession.invalidate();

    if (hasPerformedInitialSync) {
      void performSync(binding);
    } else {
      syncStateStore.reset();
    }
  });

  const handleDocumentVisibilityChange = (): void => {
    if (hasPerformedInitialSync && document.visibilityState === 'visible') {
      void performSync(get(appSelectedDriveItemBindingStore));
    }
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

  onMount(() => {
    appShellIsMounted = true;
    let isMounted = true;
    showLoadingPlaceholder = true;
    syncStateStore.reset();
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange);

    void (async () => {
      const startupStart = performance.now();
      try {
        await measurePhase('auth', initializeAppAuthClient);
        if (!isMounted) return;
        const authSession = resolveAppAuthClient().getSession();
        syncSelectedDriveItemBindingStoreAtStartup(authSession, appSelectedDriveItemBindingStore);
      } catch (error) {
        console.warn('Auth bootstrap initialization failed at app-shell startup.', error);
        if (!isMounted) return;
        appSelectedDriveItemBindingStore.setActiveAccountId(null);
        syncStateStore.setError($_('sync.failure.auth'), { branch: 'online_auth_expired' });
        showLoadingPlaceholder = false;
        return;
      }

      if (!isMounted) {
        return;
      }

      hasPerformedInitialSync = true;
      const binding = get(appSelectedDriveItemBindingStore);
      await performSync(binding);
      if (isMounted) {
        showLoadingPlaceholder = false;
        await tick();
        performance.measure('conspectus:first-data-decision', {
          start: startupStart,
          end: performance.now(),
        });
        if (
          get(syncStateStore).state === 'synced' &&
          ['accounts', 'transfers'].includes(currentRoute)
        ) {
          requestAnimationFrame(() => {
            if (isMounted)
              performance.measure('conspectus:first-data-frame', {
                start: startupStart,
                end: performance.now(),
              });
          });
        }
      }
    })();

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
    };
  });

  afterUpdate(() => {
    if (!appShellIsMounted || showLoadingPlaceholder) return;
    if (appContentElement !== null && lastRenderedRoute !== currentRoute) {
      lastRenderedRoute = currentRoute;
      appContentElement.scrollTop = 0;
    }
  });

  onDestroy(() => {
    unsubscribe();
    unsubscribeEdit?.();
    editController?.invalidate();
    unsubscribeAddTransferSaveController();
    unsubscribeReceiptCommitController();
    unsubscribeSelectedBinding();
    appShellIsMounted = false;
    refreshController.dispose();
    if (ownedReceiptCaptureController === null) {
      effectiveReceiptCaptureController?.cancel();
    } else {
      ownedReceiptCaptureController.dispose();
    }
    if (ownedReceiptAnalysisController === null) {
      effectiveReceiptAnalysisController?.reset();
    } else {
      ownedReceiptAnalysisController.dispose();
    }
    receiptPreparationController.reset();
    appDatabaseSession.invalidate();
    resolveAppDbRuntime().close();
  });
</script>

{#if editedTransfer !== null && editController !== null}
  {#key editController}
    <EditTransferSheet
      transfer={editedTransfer}
      controller={editController}
      bind:isOpen={editIsOpen}
      {networkStateStore}
      onClose={() => {
        editIsOpen = false;
      }}
    />
  {/key}
{/if}

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

  {#if !editIsOpen && editState !== null && !['idle', 'failed', 'saved', 'invalidated'].includes(editState.phase)}
    <section class="pending-transfer-sync" role="status" data-testid="pending-transfer-edit">
      <p>{$_('editTransfer.pending')}</p>
      <button
        type="button"
        class="app-button app-button--secondary"
        on:click={() => {
          editIsOpen = true;
        }}>{$_('editTransfer.title')}</button
      >
    </section>
  {/if}

  {#if pendingReceiptNeedsAttention}
    <section class="pending-transfer-sync" role="alert" data-testid="pending-receipt-sync">
      <div>
        <h2>{$_('addTransfer.receipt.commit.pendingTitle')}</h2>
        <p>
          {$_(
            receiptCommitState.phase === 'remote_commit_recovery_failed'
              ? 'addTransfer.receipt.commit.pendingRemoteSavedDescription'
              : 'addTransfer.receipt.commit.pendingDescription',
          )}
        </p>
      </div>
      <button
        type="button"
        class="app-button app-button--primary"
        data-testid="pending-receipt-open"
        on:click={openPendingReceipt}
      >
        {$_('addTransfer.receipt.commit.pendingAction')}
      </button>
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
    <div class="app-content__page">
      {#if showLoadingPlaceholder}
        <LoadingPlaceholder />
      {:else if refreshHasFailed && currentRoute !== 'settings'}
        {#if !staleTokenRecoveryIsRequired && !missingFileRecoveryIsRequired}
          <section role="alert" data-testid="database-recovery">
            <p>{$syncStateStore.message}</p>
            {#if ['database_invalid', 'permission_denied'].includes($syncStateStore.branch ?? '')}
              <button
                type="button"
                class="app-button app-button--primary"
                on:click={openMissingFileRecovery}
              >
                {$_('appShell.selectAnotherFile')}
              </button>
            {:else}
              <button
                type="button"
                class="app-button app-button--primary"
                disabled={!$networkStateStore || forceRefreshIsRunning}
                on:click={() => void requestForceRefresh()}
              >
                {$_('sync.failure.retry')}
              </button>
            {/if}
          </section>
        {/if}
      {:else if currentRoute === 'accounts'}
        <AccountsRoute {syncStateStore} />
      {:else if currentRoute === 'transfers'}
        <TransfersRoute onEditTransfer={openTransferEditor} {syncStateStore} />
      {:else if currentRoute === 'add'}
        <AddRoute
          bind:fields={addTransferFields}
          saveController={addTransferSaveController}
          receiptCaptureController={effectiveReceiptCaptureController}
          resolveReceiptRules={() => {
            const accountId = resolveAppAuthClient().getSession().account?.homeAccountId;
            const settings = accountId ? openRouterSettingsStore.read(accountId) : null;
            return settings === null
              ? null
              : (toStoredReadyOpenRouterReceiptConfiguration(settings)?.transferRules ?? null);
          }}
          receiptAnalysisController={effectiveReceiptAnalysisController}
          {receiptPreparationController}
          {receiptCommitController}
          {resolveReceiptCommitIdentity}
          {networkStateStore}
          canOpenPanel={addTransferDatabaseIsReady}
          canCreateTransfer={$syncStateStore.state === 'synced' && appDatabaseSession.isWritable()}
        />
      {:else if SettingsComponent !== null}
        <svelte:component
          this={SettingsComponent}
          {syncStateStore}
          onForceRefresh={requestForceRefresh}
        />
      {:else if settingsLoadFailed}
        <p role="alert">{$_('sync.failure.view')}</p>
        <button type="button" class="app-button" on:click={loadSettings}
          >{$_('sync.failure.retryView')}</button
        >
      {:else}
        <div data-testid="route-settings"><LoadingPlaceholder /></div>
      {/if}
      {#if !showLoadingPlaceholder}<DeploymentInfoFooter />{/if}
    </div>
  </main>

  <div class="app-shell__bottom" data-testid="app-shell-bottom">
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
