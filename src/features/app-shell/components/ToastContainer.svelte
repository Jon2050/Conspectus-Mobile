<!-- Renders transient toast notifications as dismissible button controls above the app shell. -->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { appToastStore } from '@shared';

  const removeToast = (id: string) => {
    appToastStore.remove(id);
  };
</script>

<div class="toast-container" aria-live="polite">
  {#each $appToastStore as toast (toast.id)}
    <button
      type="button"
      class="toast toast--{toast.type}"
      animate:flip={{ duration: 250 }}
      in:fly={{ y: 50, duration: 300 }}
      out:fade={{ duration: 150 }}
      on:click={() => removeToast(toast.id)}
    >
      <span class="toast__message">{toast.message}</span>
    </button>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    pointer-events: none;
    padding: 0 1rem;
  }

  .toast {
    display: flex;
    align-items: center;
    padding: 0.75rem 1.25rem;
    background: var(--surface-strong);
    color: var(--text-primary);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-md);
    font-size: 0.9rem;
    font-weight: 500;
    pointer-events: auto;
    cursor: pointer;
    max-width: 100%;
    margin: 0;
  }

  .toast--info {
    border-left: 4px solid var(--accent);
  }

  .toast--success {
    border-left: 4px solid var(--positive);
  }

  .toast--error {
    border-left: 4px solid var(--negative);
  }

  .toast--warning {
    border-left: 4px solid #f59e0b;
  }
</style>
