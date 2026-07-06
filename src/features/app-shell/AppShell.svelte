<!-- Coordinates shell routing, startup auth hydration, and shared end-of-page deployment footer behavior. -->
<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import { get, type Readable } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import type { DriveItemBinding } from '@graph';
  import {
    appSelectedDriveItemBindingStore,
    appSyncStateStore,
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
  import { initializeAppAuthClient, resolveAppAuthClient } from './authClientResolver';
  import { resolveAppCacheStore } from './cacheStoreResolver';
  import { createCachedDatabaseSnapshotService } from './cachedDatabaseSnapshotService';
  import { resolveAppGraphClient } from './graphClientResolver';
  import { resolveAppDbRuntime } from './dbRuntimeResolver';
  import { APP_ROUTES, createHashRouteStore, DEFAULT_ROUTE, type AppRouteKey } from './hashRouting';
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
  import {
    createInitialFormFields,
    type AddTransferFormFields,
  } from './routes/addTransferFormState';

  export let routeStore: Readable<AppRouteKey> = createHashRouteStore();
  export let syncStateStore: SyncStateStore = appSyncStateStore;
  export let loadingDelayMs = 160;
  export let showLoadingPlaceholder = true;

  const FOOTER_VISIBILITY_THRESHOLD_PX = 24;
  // Keep the footer visible until the user scrolls far enough away from the end of the page.
  const FOOTER_VISIBILITY_HYSTERESIS_PX = 48;

  let currentRoute: AppRouteKey = DEFAULT_ROUTE;
  let addTransferFields: AddTransferFormFields = createInitialFormFields();
  let selectedBinding: DriveItemBinding | null = get(appSelectedDriveItemBindingStore);
  let addTransferHasLoadedDatabase = false;
  let appContentElement: HTMLElement | null = null;
  let appContentPageElement: HTMLDivElement | null = null;
  let footerIsVisible = true;
  let appShellIsMounted = false;
  let selectedBindingHasEmitted = false;
  let hasPerformedInitialSync = false;
  let currentSyncId = 0;
  let footerVisibilityTrackingIsActive = false;
  let lastRenderedRoute: AppRouteKey | null = null;
  let stopFooterVisibilityTracking = (): void => {};
  const navIconBaseUrl = import.meta.env.BASE_URL;
  const unsubscribe = routeStore.subscribe((route) => {
    currentRoute = route;
  });

  $: if (selectedBinding === null || $syncStateStore.state === 'idle') {
    addTransferHasLoadedDatabase = false;
  } else if (resolveAppDbRuntime().isOpen()) {
    addTransferHasLoadedDatabase = true;
  }

  $: addTransferDatabaseIsReady =
    selectedBinding !== null && addTransferHasLoadedDatabase && $syncStateStore.state !== 'idle';

  const resolveNavIconUrl = (iconPath: string): string => `${navIconBaseUrl}${iconPath}`;

  const performSync = async (binding: DriveItemBinding | null): Promise<void> => {
    const syncId = ++currentSyncId;
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
      );
      const decision = await startupFreshnessService.resolve(
        binding,
        startupIsOnline,
        (loadedBytes, totalBytes) => {
          if (syncId === currentSyncId) {
            updateStartupSyncProgress(syncStateStore, loadedBytes, totalBytes);
          }
        },
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

  const unsubscribeSelectedBinding = appSelectedDriveItemBindingStore.subscribe((binding) => {
    selectedBinding = binding;
    if (!selectedBindingHasEmitted) {
      selectedBindingHasEmitted = true;
      return;
    }

    if (hasPerformedInitialSync) {
      void performSync(binding);
    } else {
      syncStateStore.reset();
    }
  });

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
      void performSync(binding);
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
    unsubscribeSelectedBinding();
    resolveAppDbRuntime().close();
    disconnectFooterVisibilityTracking();
  });
</script>

<div class="app-shell" data-testid="app-shell">
  <header class="app-header">
    <h1>{$_('appShell.title')}</h1>
  </header>

  {#if $syncStateStore.state === 'syncing' && $syncStateStore.progress !== null}
    <section class="startup-sync-progress" data-testid="startup-sync-progress">
      <ProgressIndicator
        loaded={$syncStateStore.progress.loaded}
        total={$syncStateStore.progress.total}
        kind={$syncStateStore.progress.kind}
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
        <AccountsRoute />
      {:else if currentRoute === 'transfers'}
        <TransfersRoute />
      {:else if currentRoute === 'add'}
        <AddRoute bind:fields={addTransferFields} canOpenPanel={addTransferDatabaseIsReady} />
      {:else}
        <SettingsRoute />
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
