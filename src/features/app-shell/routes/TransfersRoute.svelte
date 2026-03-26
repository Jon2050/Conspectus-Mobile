<!-- Implements month navigation controls and swipe handling for transfer-month browsing scaffolding. -->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { appSyncStateStore, type SyncState } from '@shared';
  import {
    createAccountQueryService,
    createCategoryQueryService,
    createTransferMonthQueryService,
  } from '@db';
  import SkeletonCard from '../components/SkeletonCard.svelte';
  import { resolveAppDbRuntime } from '../dbRuntimeResolver';
  import {
    createTransfersRouteController,
    type TransfersRouteController,
    type TransfersRouteState,
  } from './transfersRouteController';
  import {
    formatMonthLabel,
    getCurrentMonthAnchorEpochDay,
    resolveSwipeIntent,
    shiftMonthAnchorEpochDay,
    toMonthKey,
  } from './transfersMonthNavigation';

  export let controller: TransfersRouteController = createTransfersRouteController(
    createTransferMonthQueryService(resolveAppDbRuntime()),
    createAccountQueryService(resolveAppDbRuntime()),
    createCategoryQueryService(resolveAppDbRuntime()),
  );

  const MONTH_LABEL_TRANSITION_DURATION_MS = 180;

  let monthAnchorEpochDay = getCurrentMonthAnchorEpochDay();
  let swipeStartX: number | null = null;
  let swipeStartY: number | null = null;
  let monthTransitionDirection: 'previous' | 'next' = 'next';
  let state: TransfersRouteState = controller.getState();
  let lastObservedSyncState: SyncState = 'idle';

  $: monthKey = toMonthKey(monthAnchorEpochDay);
  $: monthLabel = formatMonthLabel(monthAnchorEpochDay);
  $: monthLabelTransitionKey = `${monthTransitionDirection}-${monthKey}`;
  $: monthLabelTransitionOffsetX = monthTransitionDirection === 'next' ? 20 : -20;

  $: {
    void controller.load(monthAnchorEpochDay);
  }

  const unsubscribeController = controller.subscribe((nextState) => {
    state = nextState;
  });

  const unsubscribeSyncState = appSyncStateStore.subscribe((syncSnapshot) => {
    if (syncSnapshot.state === lastObservedSyncState) {
      return;
    }
    lastObservedSyncState = syncSnapshot.state;
    if (
      syncSnapshot.state === 'synced' ||
      syncSnapshot.state === 'stale' ||
      syncSnapshot.state === 'offline'
    ) {
      void controller.load(monthAnchorEpochDay);
    }
  });

  onDestroy(() => {
    unsubscribeController();
    unsubscribeSyncState();
  });

  const clearSwipeStart = (): void => {
    swipeStartX = null;
    swipeStartY = null;
  };
  const shiftMonth = (deltaMonths: number): void => {
    if (deltaMonths === 0) return;
    monthTransitionDirection = deltaMonths > 0 ? 'next' : 'previous';
    monthAnchorEpochDay = shiftMonthAnchorEpochDay(monthAnchorEpochDay, deltaMonths);
  };
  const handlePreviousMonthClick = (): void => shiftMonth(-1);
  const handleNextMonthClick = (): void => shiftMonth(1);

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
    if (swipeIntent === 'previous') shiftMonth(-1);
    else if (swipeIntent === 'next') shiftMonth(1);
    clearSwipeStart();
  };
</script>

<section
  class="transfers-route"
  data-testid="route-transfers"
  aria-busy={state.operation === 'loading'}
>
  <h2>Transfers</h2>
  <div class="transfers-route__month-navigation" data-testid="transfers-month-navigation">
    <button
      type="button"
      class="app-button app-button--secondary transfers-route__month-button"
      data-testid="transfers-month-previous-button"
      aria-label="Previous month"
      on:click={handlePreviousMonthClick}>Previous</button
    >
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
      on:click={handleNextMonthClick}>Next</button
    >
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
    <p
      class="transfers-route__status"
      class:transfers-route__status--error={state.operation === 'error'}
      data-testid="transfers-route-status"
      aria-live="polite"
      role={state.operation === 'error' ? 'alert' : undefined}
    >
      {#if state.operation === 'loading'}
        Loading transfers...
      {:else if state.operation === 'error'}
        {state.error?.message ?? 'Failed to load transfers.'}
      {:else if state.operation === 'empty'}
        No transfers found for this month.
      {:else}
        {state.transfers.length} transfers found.
      {/if}
    </p>

    {#if state.operation === 'loading'}
      <div class="transfers-route__loading" data-testid="transfers-route-loading">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    {:else if state.operation === 'empty'}
      <div class="transfers-route__empty" data-testid="transfers-route-empty">
        <p>There are no transfers recorded for this month.</p>
      </div>
    {:else if state.operation === 'ready'}
      <ul class="transfers-route__cards" data-testid="transfers-route-cards">
        {#each state.transfers as transfer (transfer.transferId)}
          <li class="transfers-route__card-item">
            <article
              class={`transfer-card transfer-card--${transfer.amountSemantic}`}
              data-testid={`transfer-card-${transfer.transferId}`}
              data-transfer-id={transfer.transferId}
            >
              <div class="transfer-card__header">
                <div>
                  <p class="transfer-card__date">{transfer.dateDisplay}</p>
                  <h3 class="transfer-card__name">{transfer.name}</h3>
                </div>
                <span
                  class="transfer-card__amount"
                  data-testid={`transfer-amount-${transfer.transferId}`}
                  >{transfer.amountDisplay}</span
                >
              </div>
              <div class="transfer-card__accounts">
                <span class="transfer-card__account transfer-card__account--from"
                  >{transfer.fromAccountName}</span
                >
                <span class="transfer-card__account-arrow">→</span>
                <span class="transfer-card__account transfer-card__account--to"
                  >{transfer.toAccountName}</span
                >
              </div>
              {#if transfer.categoryNames.length > 0}
                <ul class="transfer-card__categories">
                  {#each transfer.categoryNames as category (category)}
                    <li class="transfer-card__category">
                      <span class="app-badge">{category}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </article>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .transfers-route {
    --transfers-amount-positive: #0f6b43;
    --transfers-amount-negative: #b42318;
    --transfers-amount-neutral: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  @media (prefers-color-scheme: dark) {
    .transfers-route {
      --transfers-amount-positive: #34d399;
      --transfers-amount-negative: #fca5a5;
      --transfers-amount-neutral: #d1d5db;
    }
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
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    touch-action: pan-y;
  }

  .transfers-route__status {
    margin: 0;
    color: var(--text-secondary);
    min-height: 1.5rem;
  }

  .transfers-route__status--error {
    padding: 1rem;
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--negative) 72%, var(--text-primary));
    background: color-mix(in srgb, var(--negative) 14%, var(--surface-strong));
  }

  .transfers-route__loading,
  .transfers-route__empty {
    display: grid;
    gap: 0.75rem;
  }

  .transfers-route__empty {
    padding: 1rem;
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .transfers-route__empty p {
    margin: 0;
    color: var(--text-secondary);
  }

  .transfers-route__cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }

  .transfers-route__card-item {
    margin: 0;
  }

  .transfer-card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
    border-left: 4px solid var(--accent);
  }

  .transfer-card--positive {
    border-left-color: var(--positive);
  }
  .transfer-card--negative {
    border-left-color: var(--negative);
  }
  .transfer-card--neutral {
    border-left-color: var(--accent);
  }

  .transfer-card__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: start;
  }

  .transfer-card__date {
    margin: 0 0 0.2rem 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .transfer-card__name {
    margin: 0;
    font-size: 1rem;
    line-height: 1.2;
    word-break: break-word;
  }

  .transfer-card__amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: right;
    color: var(--text-primary);
  }

  .transfer-card--positive .transfer-card__amount {
    color: var(--transfers-amount-positive);
  }
  .transfer-card--negative .transfer-card__amount {
    color: var(--transfers-amount-negative);
  }
  .transfer-card--neutral .transfer-card__amount {
    color: var(--transfers-amount-neutral);
  }

  .transfer-card__accounts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .transfer-card__account {
    font-weight: 500;
  }

  .transfer-card__account-arrow {
    opacity: 0.6;
  }

  .transfer-card__categories {
    list-style: none;
    padding: 0;
    margin: 0.2rem 0 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .transfer-card__category {
    margin: 0;
  }

  .app-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-secondary) 15%, transparent);
    color: var(--text-primary);
    white-space: nowrap;
  }
</style>
