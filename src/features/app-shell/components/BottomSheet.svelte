<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly } from 'svelte/transition';

  export let isOpen = false;
  export let title = '';

  let dialogElement: HTMLDialogElement | null = null;
  const dispatch = createEventDispatcher();

  const requestClose = () => {
    if (dialogElement?.open) {
      dialogElement.close();
    }
  };

  const handleDialogClose = () => {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    dispatch('close');
  };

  const handleDialogCancel = (event: Event) => {
    event.preventDefault();
    requestClose();
  };

  const handleDialogClick = (event: MouseEvent) => {
    if (dialogElement === null || event.target !== dialogElement) {
      return;
    }

    const dialogBounds = dialogElement.getBoundingClientRect();
    const clickWasInsideDialogBounds =
      event.clientX >= dialogBounds.left &&
      event.clientX <= dialogBounds.right &&
      event.clientY >= dialogBounds.top &&
      event.clientY <= dialogBounds.bottom;

    if (clickWasInsideDialogBounds) {
      return;
    }

    requestClose();
  };

  $: if (dialogElement !== null) {
    if (isOpen) {
      if (!dialogElement.open) {
        dialogElement.showModal();
      }
    } else if (dialogElement.open) {
      dialogElement.close();
    }
  }
</script>

{#if isOpen}
  <dialog
    bind:this={dialogElement}
    class="bottom-sheet__dialog"
    aria-modal="true"
    in:fly={{ y: '100%', duration: 350, opacity: 1, easing: (t) => 1 - Math.pow(1 - t, 4) }}
    out:fly={{ y: '100%', duration: 250 }}
    on:cancel={handleDialogCancel}
    on:click={handleDialogClick}
    on:close={handleDialogClose}
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

  .bottom-sheet__dialog::backdrop {
    background: color-mix(in srgb, black 40%, transparent);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
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
