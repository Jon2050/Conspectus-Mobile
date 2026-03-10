<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';

  export let isOpen = false;
  export let title = '';

  const dispatch = createEventDispatcher();

  const handleClose = () => {
    isOpen = false;
    dispatch('close');
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      handleClose();
    }
  };
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bottom-sheet__backdrop"
    in:fade={{ duration: 200 }}
    out:fade={{ duration: 200 }}
    on:click={handleClose}
  ></div>

  <dialog
    open
    class="bottom-sheet__dialog"
    in:fly={{ y: '100%', duration: 350, opacity: 1, easing: (t) => 1 - Math.pow(1 - t, 4) }}
    out:fly={{ y: '100%', duration: 250 }}
  >
    <div class="bottom-sheet__handle"></div>
    {#if title}
      <header class="bottom-sheet__header">
        <h3>{title}</h3>
      </header>
    {/if}

    <div class="bottom-sheet__content">
      <slot />
    </div>
  </dialog>
{/if}

<style>
  .bottom-sheet__backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, black 40%, transparent);
    z-index: 40;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .bottom-sheet__dialog {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-width: 32rem;
    margin: 0 auto;
    background: var(--surface-strong);
    border: none;
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    padding: 1rem 1.25rem calc(1rem + env(safe-area-inset-bottom, 0));
    z-index: 50;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .bottom-sheet__handle {
    width: 40px;
    height: 5px;
    background: var(--border);
    border-radius: var(--radius-pill);
    margin: 0 auto 1rem;
  }

  .bottom-sheet__header {
    margin-bottom: 1rem;
  }

  .bottom-sheet__header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .bottom-sheet__content {
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Hide scrollbar for clean mobile look but keeps functionality */
    scrollbar-width: none;
  }
  .bottom-sheet__content::-webkit-scrollbar {
    display: none;
  }
</style>
