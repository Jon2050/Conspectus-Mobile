<!-- Coordinates shell routing, startup auth hydration, and shared end-of-page deployment footer behavior. -->
<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import { get, type Readable } from 'svelte/store';
  import { appSelectedDriveItemBindingStore, type SyncState } from '@shared';
  import LoadingPlaceholder from './components/LoadingPlaceholder.svelte';
  import DeploymentInfoFooter from './components/DeploymentInfoFooter.svelte';
  import AccountsRoute from './routes/AccountsRoute.svelte';
  import TransfersRoute from './routes/TransfersRoute.svelte';
  import AddRoute from './routes/AddRoute.svelte';
  import SettingsRoute from './routes/SettingsRoute.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import { initializeAppAuthClient, resolveAppAuthClient } from './authClientResolver';
  import { resolveAppCacheStore } from './cacheStoreResolver';
  import { createCachedDatabaseSnapshotService } from './cachedDatabaseSnapshotService';
  import { resolveAppGraphClient } from './graphClientResolver';
  import { APP_ROUTES, createHashRouteStore, DEFAULT_ROUTE, type AppRouteKey } from './hashRouting';
  import {
    createStartupFreshnessService,
    type StartupFreshnessBranch,
    type StartupFreshnessDecision,
  } from './startupFreshnessService';
  import { resolveAppStartupIsOnline } from './startupNetworkStateResolver';
  import { syncSelectedDriveItemBindingStoreAtStartup } from './startupBindingSync';

  export let routeStore: Readable<AppRouteKey> = createHashRouteStore();
  export let loadingDelayMs = 160;
  export let showLoadingPlaceholder = true;

  const FOOTER_VISIBILITY_THRESHOLD_PX = 24;

  let currentRoute: AppRouteKey = DEFAULT_ROUTE;
  let appContentElement: HTMLElement | null = null;
  let appContentPageElement: HTMLDivElement | null = null;
  let footerIsVisible = true;
  let appShellIsMounted = false;
  let footerVisibilityTrackingIsActive = false;
  let lastRenderedRoute: AppRouteKey | null = null;
  let startupSyncState: SyncState = 'idle';
  let startupSyncBranch: StartupFreshnessBranch | null = null;
  let startupSyncMessage: string | null = null;
  let stopFooterVisibilityTracking = (): void => {};
  const unsubscribe = routeStore.subscribe((route) => {
    currentRoute = route;
  });

  const buildStartupSyncMessage = (decision: StartupFreshnessDecision): string | null => {
    switch (decision.branch) {
      case 'no_binding':
        return null;
      case 'online_unchanged':
        return 'Cached DB is current with OneDrive.';
      case 'online_changed':
        return 'Downloaded the latest DB from OneDrive.';
      case 'offline_cached':
        return 'Offline mode using the last cached DB.';
      case 'online_metadata_failed_cached':
        return 'Using cached DB because the OneDrive freshness check failed.';
      case 'online_download_failed_cached':
        return 'Using cached DB because downloading the latest DB failed.';
      case 'offline_missing_cache':
      case 'online_metadata_failed':
      case 'online_download_failed':
        return decision.failure.message;
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

  const applyStartupFreshnessDecision = (decision: StartupFreshnessDecision): void => {
    startupSyncState = decision.syncState;
    startupSyncBranch = decision.branch;
    startupSyncMessage = buildStartupSyncMessage(decision);
  };

  const applyUnexpectedStartupSyncError = (message: string): void => {
    startupSyncState = 'error';
    startupSyncBranch = null;
    startupSyncMessage = message;
  };

  const updateFooterVisibility = (): void => {
    if (appContentElement === null) {
      footerIsVisible = true;
      return;
    }

    const { clientHeight, scrollHeight, scrollTop } = appContentElement;
    footerIsVisible =
      scrollHeight <= clientHeight + FOOTER_VISIBILITY_THRESHOLD_PX ||
      scrollTop + clientHeight >= scrollHeight - FOOTER_VISIBILITY_THRESHOLD_PX;
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

    void (async () => {
      try {
        await initializeAppAuthClient();
        const authSession = resolveAppAuthClient().getSession();
        syncSelectedDriveItemBindingStoreAtStartup(authSession, appSelectedDriveItemBindingStore);
      } catch (error) {
        console.warn('Auth bootstrap initialization failed at app-shell startup.', error);
        appSelectedDriveItemBindingStore.setActiveAccountId(null);
        return;
      }

      try {
        const binding = get(appSelectedDriveItemBindingStore);
        const graphClient = resolveAppGraphClient();
        const cacheStore = resolveAppCacheStore();
        const startupFreshnessService = createStartupFreshnessService(
          graphClient,
          cacheStore,
          createCachedDatabaseSnapshotService(graphClient, cacheStore),
        );
        const decision = await startupFreshnessService.resolve(
          binding,
          resolveAppStartupIsOnline(),
        );

        if (!isMounted) {
          return;
        }

        applyStartupFreshnessDecision(decision);
        logStartupFreshnessDecision(decision, binding?.name ?? null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.warn('Startup freshness resolution failed unexpectedly.', error);
        applyUnexpectedStartupSyncError(
          'Startup sync failed unexpectedly. Check the browser console and retry.',
        );
      }
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
    disconnectFooterVisibilityTracking();
  });
</script>

<div class="app-shell" data-testid="app-shell">
  <header class="app-header">
    <h1>Conspectus Mobile</h1>
    <p>Mobile-first application shell placeholder</p>
  </header>

  {#if startupSyncMessage !== null}
    <section
      class={`startup-sync-status startup-sync-status--${startupSyncState}`}
      data-testid="startup-sync-status"
      data-sync-branch={startupSyncBranch}
      data-sync-state={startupSyncState}
      aria-live="polite"
    >
      {#if startupSyncState === 'error'}
        <p role="alert">{startupSyncMessage}</p>
      {:else}
        <p>{startupSyncMessage}</p>
      {/if}
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
        <AddRoute />
      {:else}
        <SettingsRoute />
      {/if}
    </div>
  </main>

  <div class="app-shell__bottom">
    <nav class="app-nav" aria-label="Primary">
      {#each APP_ROUTES as route (route.key)}
        <a
          class="app-nav__item"
          class:is-active={route.key === currentRoute}
          href={route.hash}
          aria-current={route.key === currentRoute ? 'page' : undefined}
        >
          {route.label}
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
  .startup-sync-status {
    margin: 0 1rem;
    padding: 0.85rem 1rem;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }

  .startup-sync-status p {
    margin: 0;
    font-size: 0.92rem;
  }

  .startup-sync-status--synced {
    background: color-mix(in srgb, var(--positive) 16%, white);
    color: color-mix(in srgb, var(--positive) 55%, black);
  }

  .startup-sync-status--offline {
    background: color-mix(in srgb, var(--accent) 14%, white);
    color: color-mix(in srgb, var(--accent) 55%, black);
  }

  .startup-sync-status--stale {
    background: color-mix(in srgb, #d97706 16%, white);
    color: color-mix(in srgb, #d97706 58%, black);
  }

  .startup-sync-status--error {
    background: color-mix(in srgb, var(--negative) 14%, white);
    color: color-mix(in srgb, var(--negative) 60%, black);
  }
</style>
