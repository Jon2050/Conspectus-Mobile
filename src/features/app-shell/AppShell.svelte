<!-- Coordinates shell routing, startup auth hydration, and shared end-of-page deployment footer behavior. -->
<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import { get, type Readable } from 'svelte/store';
  import type { DriveItemBinding } from '@graph';
  import {
    appSelectedDriveItemBindingStore,
    appSyncStateStore,
    type SyncStateStore,
  } from '@shared';
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
    type StartupFreshnessDecision,
  } from './startupFreshnessService';
  import {
    applyStartupFreshnessDecision,
    applyUnexpectedStartupSyncError,
    beginStartupSync,
    updateStartupSyncProgress,
  } from './startupSyncStateController';
  import { resolveAppStartupIsOnline } from './startupNetworkStateResolver';
  import { syncSelectedDriveItemBindingStoreAtStartup } from './startupBindingSync';

  export let routeStore: Readable<AppRouteKey> = createHashRouteStore();
  export let syncStateStore: SyncStateStore = appSyncStateStore;
  export let loadingDelayMs = 160;
  export let showLoadingPlaceholder = true;

  const FOOTER_VISIBILITY_THRESHOLD_PX = 24;
  // Keep the footer visible until the user scrolls far enough away from the end of the page.
  const FOOTER_VISIBILITY_HYSTERESIS_PX = 48;

  let currentRoute: AppRouteKey = DEFAULT_ROUTE;
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
  const unsubscribe = routeStore.subscribe((route) => {
    currentRoute = route;
  });

  const performSync = async (binding: DriveItemBinding | null): Promise<void> => {
    const syncId = ++currentSyncId;
    syncStateStore.reset();

    if (binding === null) {
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
        createCachedDatabaseSnapshotService(graphClient, cacheStore),
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

      applyStartupFreshnessDecision(syncStateStore, decision);
      logStartupFreshnessDecision(decision, binding?.name ?? null);
    } catch (error) {
      if (!appShellIsMounted || syncId !== currentSyncId) {
        return;
      }

      console.warn('Startup freshness resolution failed unexpectedly.', error);
      applyUnexpectedStartupSyncError(
        syncStateStore,
        'Startup sync failed unexpectedly. Check the browser console and retry.',
      );
    }
  };

  const unsubscribeSelectedBinding = appSelectedDriveItemBindingStore.subscribe((binding) => {
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
    disconnectFooterVisibilityTracking();
  });
</script>

<div class="app-shell" data-testid="app-shell">
  <header class="app-header">
    <h1>Conspectus Mobile</h1>
    <p>Mobile-first application shell placeholder</p>
  </header>

  {#if $syncStateStore.message !== null}
    <section
      class={`startup-sync-status startup-sync-status--${$syncStateStore.state}`}
      data-testid="startup-sync-status"
      data-sync-branch={$syncStateStore.branch ?? undefined}
      data-sync-state={$syncStateStore.state}
      aria-live="polite"
    >
      {#if $syncStateStore.state === 'error'}
        <p role="alert">{$syncStateStore.message}</p>
        {#if $syncStateStore.branch === 'online_auth_expired'}
          <div class="startup-sync-actions">
            <a href="#settings" class="app-button app-button--secondary">Sign in again</a>
          </div>
        {/if}
      {:else}
        <p>{$syncStateStore.message}</p>
        {#if $syncStateStore.branch === 'online_auth_expired_cached'}
          <div class="startup-sync-actions">
            <a href="#settings" class="app-button app-button--secondary">Sign in again</a>
          </div>
        {/if}
        {#if $syncStateStore.progress !== null && $syncStateStore.state === 'syncing'}
          <div class="startup-sync-progress">
            <progress
              max={$syncStateStore.progress.total ?? undefined}
              value={$syncStateStore.progress.total !== null
                ? $syncStateStore.progress.loaded
                : undefined}
            ></progress>
            <span class="startup-sync-progress-text">
              {#if $syncStateStore.progress.total !== null}
                {Math.round($syncStateStore.progress.loaded / 1024)} KB / {Math.round(
                  $syncStateStore.progress.total / 1024,
                )} KB
              {:else}
                {Math.round($syncStateStore.progress.loaded / 1024)} KB downloaded...
              {/if}
            </span>
          </div>
        {/if}
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

  .startup-sync-status--syncing {
    background: color-mix(in srgb, var(--accent) 12%, white);
    color: color-mix(in srgb, var(--accent) 68%, black);
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

  .startup-sync-actions {
    margin-top: 0.75rem;
    display: flex;
  }

  .startup-sync-actions .app-button {
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
    min-height: auto;
  }

  .startup-sync-progress {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .startup-sync-progress progress {
    width: 100%;
    height: 6px;
    border: none;
    border-radius: var(--radius-sm);
    background-color: rgba(0, 0, 0, 0.1);
  }

  .startup-sync-progress progress::-webkit-progress-bar {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: var(--radius-sm);
  }

  .startup-sync-progress progress::-webkit-progress-value {
    background-color: currentColor;
    border-radius: var(--radius-sm);
  }

  .startup-sync-progress progress::-moz-progress-bar {
    background-color: currentColor;
    border-radius: var(--radius-sm);
  }

  .startup-sync-progress-text {
    font-size: 0.75rem;
    opacity: 0.8;
    align-self: flex-end;
  }
</style>
