<script module lang="ts">
  let nextBottomSheetTitleId = 0;

  const createBottomSheetTitleId = (): string => {
    nextBottomSheetTitleId += 1;
    return `bottom-sheet-title-${nextBottomSheetTitleId}`;
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    isOpen = $bindable(false),
    title = '',
    ariaLabel = 'Dialog',
    canClose = true,
    closeLabel = 'Close',
    onClose = () => {},
    children,
  }: {
    isOpen?: boolean;
    title?: string;
    ariaLabel?: string;
    canClose?: boolean;
    closeLabel?: string;
    onClose?: () => void;
    children?: Snippet;
  } = $props();
  let dialogElement = $state<HTMLDialogElement | null>(null);
  let contentElement = $state<HTMLDivElement | null>(null);
  let headerElement = $state<HTMLElement | null>(null);
  let dragStart: { pointerId: number; x: number; y: number } | null = null;
  let dragOffset = $state(0);
  // Require a deliberate downward movement, confined to the grip rather than form scrolling.
  const CLOSE_DRAG_DISTANCE_PX = 80;
  const titleId = createBottomSheetTitleId();

  const requestClose = () => {
    if (!canClose) {
      return;
    }

    isOpen = false;
    onClose();
  };

  const handleDragStart = (event: PointerEvent) => {
    if (!canClose || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: PointerEvent) => {
    if (dragStart?.pointerId !== event.pointerId) return;
    dragOffset = canClose ? Math.max(0, event.clientY - dragStart.y) : 0;
  };

  const resetDrag = () => {
    dragStart = null;
    dragOffset = 0;
  };

  const handleDragEnd = (event: PointerEvent) => {
    if (dragStart?.pointerId !== event.pointerId) return;
    const distance = event.clientY - dragStart.y;
    const horizontalDistance = Math.abs(event.clientX - dragStart.x);
    resetDrag();
    if (distance >= CLOSE_DRAG_DISTANCE_PX && distance > horizontalDistance) requestClose();
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

  $effect(() => {
    if (dialogElement === null) return;
    if (isOpen) {
      if (!dialogElement.open) {
        dialogElement.showModal();
        headerElement?.focus({ preventScroll: true });
        if (contentElement !== null) contentElement.scrollTop = 0;
      }
    } else if (dialogElement.open) {
      dialogElement.close();
    }
  });
</script>

{#if isOpen}
  <dialog
    bind:this={dialogElement}
    class="bottom-sheet__dialog"
    aria-modal="true"
    aria-labelledby={title ? titleId : undefined}
    aria-label={title ? undefined : ariaLabel}
    style:transform={`translateY(${dragOffset}px)`}
    oncancel={handleDialogCancel}
    onclick={handleDialogClick}
  >
    <header class="bottom-sheet__header" bind:this={headerElement} tabindex="-1" autofocus>
      <!-- Pointer handling stays on the grip so text selection and form scrolling remain native. -->
      <div
        class="bottom-sheet__grip"
        aria-hidden="true"
        onpointerdown={handleDragStart}
        onpointermove={handleDragMove}
        onpointerup={handleDragEnd}
        onpointercancel={resetDrag}
        onlostpointercapture={resetDrag}
      >
        <div class="bottom-sheet__handle"></div>
      </div>
      <div class="bottom-sheet__heading">
        {#if title}<h3 id={titleId}>{title}</h3>{/if}
        <button
          type="button"
          class="app-button app-button--secondary"
          data-testid="bottom-sheet-close"
          disabled={!canClose}
          onclick={requestClose}>{closeLabel}</button
        >
      </div>
    </header>

    <div class="bottom-sheet__content" bind:this={contentElement}>
      {@render children?.()}
    </div>
  </dialog>
{/if}

<style>
  .bottom-sheet__dialog {
    position: fixed;
    top: auto;
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
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    max-height: min(90dvh, 90vh);
  }

  .bottom-sheet__dialog:not([open]) {
    display: none;
  }

  .bottom-sheet__grip {
    padding: 0.5rem 0 1rem;
    touch-action: none;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
  }
  .bottom-sheet__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
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
    margin: 0 auto;
  }

  .bottom-sheet__header {
    margin-bottom: 1rem;
    flex: none;
  }

  .bottom-sheet__header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }

  .bottom-sheet__content {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Hide scrollbar for clean mobile look but keeps functionality */
    scrollbar-width: none;
  }
  .bottom-sheet__content::-webkit-scrollbar {
    display: none;
  }
</style>
