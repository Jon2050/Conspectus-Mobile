<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Readable } from 'svelte/store';
  import LoadingPlaceholder from './components/LoadingPlaceholder.svelte';
  import AccountsRoute from './routes/AccountsRoute.svelte';
  import TransfersRoute from './routes/TransfersRoute.svelte';
  import AddRoute from './routes/AddRoute.svelte';
  import SettingsRoute from './routes/SettingsRoute.svelte';
  import { initializeAppAuthClient } from './authClientResolver';
  import { APP_ROUTES, createHashRouteStore, DEFAULT_ROUTE, type AppRouteKey } from './hashRouting';

  export let routeStore: Readable<AppRouteKey> = createHashRouteStore();
  export let loadingDelayMs = 160;
  export let showLoadingPlaceholder = true;

  let currentRoute: AppRouteKey = DEFAULT_ROUTE;
  const unsubscribe = routeStore.subscribe((route) => {
    currentRoute = route;
  });

  onMount(() => {
    void initializeAppAuthClient().catch((error) => {
      console.warn('Auth bootstrap initialization failed at app-shell startup.', error);
    });

    if (!showLoadingPlaceholder || loadingDelayMs <= 0) {
      showLoadingPlaceholder = false;
      return;
    }

    const timerId = window.setTimeout(() => {
      showLoadingPlaceholder = false;
    }, loadingDelayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  });

  onDestroy(() => {
    unsubscribe();
  });
</script>

<div class="app-shell" data-testid="app-shell">
  <header class="app-header">
    <h1>Conspectus Mobile</h1>
    <p>Mobile-first application shell placeholder</p>
  </header>

  <main class="app-content" aria-live="polite">
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
  </main>

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
</div>
