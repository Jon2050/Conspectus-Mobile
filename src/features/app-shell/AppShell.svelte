<!-- Coordinates shell routing, startup auth hydration, and shared end-of-page deployment footer behavior. -->
<script lang="ts">
  import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
  import type { Readable } from 'svelte/store';
  import { appSelectedDriveItemBindingStore } from '@shared';
  import LoadingPlaceholder from './components/LoadingPlaceholder.svelte';
  import DeploymentInfoFooter from './components/DeploymentInfoFooter.svelte';
  import AccountsRoute from './routes/AccountsRoute.svelte';
  import TransfersRoute from './routes/TransfersRoute.svelte';
  import AddRoute from './routes/AddRoute.svelte';
  import SettingsRoute from './routes/SettingsRoute.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import { initializeAppAuthClient, resolveAppAuthClient } from './authClientResolver';
  import { APP_ROUTES, createHashRouteStore, DEFAULT_ROUTE, type AppRouteKey } from './hashRouting';
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
  let stopFooterVisibilityTracking = (): void => {};
  const unsubscribe = routeStore.subscribe((route) => {
    currentRoute = route;
  });

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

    void (async () => {
      try {
        await initializeAppAuthClient();
        const authSession = resolveAppAuthClient().getSession();
        syncSelectedDriveItemBindingStoreAtStartup(authSession, appSelectedDriveItemBindingStore);
      } catch (error) {
        console.warn('Auth bootstrap initialization failed at app-shell startup.', error);
        appSelectedDriveItemBindingStore.setActiveAccountId(null);
      }
    })();

    if (!showLoadingPlaceholder || loadingDelayMs <= 0) {
      showLoadingPlaceholder = false;
      return;
    }

    const timerId = window.setTimeout(() => {
      showLoadingPlaceholder = false;
    }, loadingDelayMs);

    return () => {
      window.clearTimeout(timerId);
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
