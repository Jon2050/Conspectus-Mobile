<!-- Keeps a service-worker update visible and actionable until the new app shell takes control. -->
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import {
    appServiceWorkerUpdateController,
    type ServiceWorkerUpdateController,
  } from '../serviceWorkerUpdateController';

  export let updateController: ServiceWorkerUpdateController = appServiceWorkerUpdateController;
</script>

{#if $updateController.phase !== 'idle'}
  <section
    class="update-banner"
    role="status"
    aria-live="polite"
    aria-busy={$updateController.phase === 'applying'}
    data-testid="service-worker-update-banner"
  >
    <div>
      <h2>{$_('appUpdate.title')}</h2>
      <p>{$_('appUpdate.description')}</p>
      {#if $updateController.phase === 'error'}
        <p class="update-banner__error" role="alert" data-testid="service-worker-update-error">
          {$_('appUpdate.error')}
        </p>
      {/if}
    </div>
    <button
      type="button"
      class="app-button app-button--primary"
      disabled={$updateController.phase === 'applying'}
      data-testid="service-worker-update-button"
      on:click={() => void updateController.acceptUpdate()}
    >
      {$updateController.phase === 'applying'
        ? $_('appUpdate.applying')
        : $updateController.phase === 'error'
          ? $_('appUpdate.retry')
          : $_('appUpdate.action')}
    </button>
  </section>
{/if}

<style>
  .update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1rem;
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-strong));
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  }

  .update-banner h2,
  .update-banner p {
    margin: 0;
  }

  .update-banner h2 {
    font-size: 1rem;
  }

  .update-banner p {
    margin-top: 0.25rem;
    color: var(--text-secondary);
  }

  .update-banner__error {
    color: color-mix(in srgb, var(--negative) 72%, var(--text-primary));
  }

  @media (max-width: 36rem) {
    .update-banner {
      align-items: stretch;
      flex-direction: column;
    }

    .update-banner :global(.app-button) {
      width: 100%;
    }
  }
</style>
