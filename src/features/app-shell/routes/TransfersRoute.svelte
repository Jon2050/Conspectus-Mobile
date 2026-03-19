<!-- Implements month navigation controls and swipe handling for transfer-month browsing scaffolding. -->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import {
    formatMonthLabel,
    getCurrentMonthAnchorEpochDay,
    resolveSwipeIntent,
    shiftMonthAnchorEpochDay,
    toMonthKey,
  } from './transfersMonthNavigation';

  const MONTH_LABEL_TRANSITION_DURATION_MS = 180;

  let monthAnchorEpochDay = getCurrentMonthAnchorEpochDay();
  let swipeStartX: number | null = null;
  let swipeStartY: number | null = null;
  let monthTransitionDirection: 'previous' | 'next' = 'next';

  $: monthKey = toMonthKey(monthAnchorEpochDay);
  $: monthLabel = formatMonthLabel(monthAnchorEpochDay);
  $: monthLabelTransitionKey = `${monthTransitionDirection}-${monthKey}`;
  $: monthLabelTransitionOffsetX = monthTransitionDirection === 'next' ? 20 : -20;

  const clearSwipeStart = (): void => {
    swipeStartX = null;
    swipeStartY = null;
  };

  const shiftMonth = (deltaMonths: number): void => {
    if (deltaMonths === 0) {
      return;
    }

    monthTransitionDirection = deltaMonths > 0 ? 'next' : 'previous';
    monthAnchorEpochDay = shiftMonthAnchorEpochDay(monthAnchorEpochDay, deltaMonths);
  };

  const handlePreviousMonthClick = (): void => {
    shiftMonth(-1);
  };

  const handleNextMonthClick = (): void => {
    shiftMonth(1);
  };

  const handleTouchStart = (event: TouchEvent): void => {
    if (event.target instanceof Element && event.target.closest('button') !== null) {
      clearSwipeStart();
      return;
    }

    const touch = event.touches.item(0) ?? event.touches[0];
    if (touch == null) {
      clearSwipeStart();
      return;
    }

    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
  };

  const handleTouchEnd = (event: TouchEvent): void => {
    if (swipeStartX === null || swipeStartY === null) {
      clearSwipeStart();
      return;
    }

    const touch = event.changedTouches.item(0) ?? event.changedTouches[0];
    if (touch == null) {
      clearSwipeStart();
      return;
    }

    const swipeIntent = resolveSwipeIntent({
      startX: swipeStartX,
      startY: swipeStartY,
      endX: touch.clientX,
      endY: touch.clientY,
    });

    if (swipeIntent === 'previous') {
      shiftMonth(-1);
    } else if (swipeIntent === 'next') {
      shiftMonth(1);
    }

    clearSwipeStart();
  };
</script>

<section class="placeholder-screen transfers-route" data-testid="route-transfers">
  <h2>Transfers</h2>

  <div class="transfers-route__month-navigation" data-testid="transfers-month-navigation">
    <button
      type="button"
      class="app-button app-button--secondary transfers-route__month-button"
      data-testid="transfers-month-previous-button"
      aria-label="Previous month"
      on:click={handlePreviousMonthClick}
    >
      Previous
    </button>

    <p
      class="transfers-route__month-label"
      data-testid="transfers-month-label"
      data-month-key={monthKey}
    >
      {#key monthLabelTransitionKey}
        <span
          in:fly={{
            x: monthLabelTransitionOffsetX,
            duration: MONTH_LABEL_TRANSITION_DURATION_MS,
            easing: cubicOut,
          }}
          out:fly={{
            x: -monthLabelTransitionOffsetX,
            duration: MONTH_LABEL_TRANSITION_DURATION_MS,
            easing: cubicOut,
          }}
        >
          {monthLabel}
        </span>
      {/key}
    </p>

    <button
      type="button"
      class="app-button app-button--secondary transfers-route__month-button"
      data-testid="transfers-month-next-button"
      aria-label="Next month"
      on:click={handleNextMonthClick}
    >
      Next
    </button>
  </div>

  <div
    class="transfers-route__swipe-surface"
    data-testid="transfers-month-swipe-surface"
    role="group"
    aria-label="Transfer month swipe area"
    on:touchstart={handleTouchStart}
    on:touchend={handleTouchEnd}
    on:touchcancel={clearSwipeStart}
  >
    <p>Transfer list rendering ships in M5-06. Month navigation is ready for query integration.</p>
    <p class="transfers-route__swipe-hint">Swipe left or right to switch months.</p>
  </div>
</section>

<style>
  .transfers-route {
    gap: 1rem;
  }

  .transfers-route__month-navigation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.5rem;
    align-items: center;
  }

  .transfers-route__month-button {
    min-height: 2.5rem;
    font-size: 0.88rem;
  }

  .transfers-route__month-label {
    margin: 0;
    text-align: center;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
  }

  .transfers-route__month-label span {
    display: inline-block;
    min-width: 9rem;
  }

  .transfers-route__swipe-surface {
    border: 1px dashed color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--radius-md);
    padding: 1rem;
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    touch-action: pan-y;
  }

  .transfers-route__swipe-surface p {
    margin: 0;
  }

  .transfers-route__swipe-hint {
    margin-top: 0.45rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
</style>
