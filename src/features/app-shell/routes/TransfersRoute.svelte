<!-- Implements month navigation controls and swipe handling for transfer-month browsing scaffolding. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import {
    appSyncStateStore,
    type SyncState,
    formatEpochDayToDate,
    formatAmountDisplay,
  } from '@shared';
  import { _, locale } from 'svelte-i18n';
  import {
    PRIMARY_INCOME_ACCOUNT_TYPE_ID,
    PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
    appAccountQueryService,
    appCategoryQueryService,
    appTransferMonthQueryService,
  } from '@db';
  import SkeletonCard from '../components/SkeletonCard.svelte';
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

  const SWIPE_DRAG_LOCK_THRESHOLD_PX = 10;
  const SWIPE_DRAG_MAX_OFFSET_PX = 56;

  export let controller: TransfersRouteController = createTransfersRouteController(
    appTransferMonthQueryService,
    appAccountQueryService,
    appCategoryQueryService,
  );

  let monthAnchorEpochDay = getCurrentMonthAnchorEpochDay();
  let swipeStartX: number | null = null;
  let swipeStartY: number | null = null;
  let swipeDragOffsetX = 0;
  let swipeLockedHorizontally = false;
  let state: TransfersRouteState = controller.getState();
  let lastObservedSyncState: SyncState = get(appSyncStateStore).state;

  $: monthKey = toMonthKey(monthAnchorEpochDay);
  $: monthLabel = formatMonthLabel(monthAnchorEpochDay, $locale);

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
    swipeDragOffsetX = 0;
    swipeLockedHorizontally = false;
  };
  const shiftMonth = (deltaMonths: number): void => {
    if (deltaMonths === 0) return;
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
    swipeDragOffsetX = 0;
    swipeLockedHorizontally = false;
  };

  const handleTouchMove = (event: TouchEvent): void => {
    if (swipeStartX === null || swipeStartY === null) {
      return;
    }
    const touch = event.touches.item(0) ?? event.touches[0];
    if (touch == null) {
      clearSwipeStart();
      return;
    }

    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    if (
      swipeLockedHorizontally ||
      (absDeltaX >= SWIPE_DRAG_LOCK_THRESHOLD_PX && absDeltaX > absDeltaY)
    ) {
      swipeLockedHorizontally = true;
      event.preventDefault();
      swipeDragOffsetX = Math.sign(deltaX) * Math.min(absDeltaX * 0.35, SWIPE_DRAG_MAX_OFFSET_PX);
    }
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
  <h2>{$_('transfers.title')}</h2>
  <div class="transfers-route__month-navigation" data-testid="transfers-month-navigation">
    <button
      type="button"
      class="app-button app-button--secondary transfers-route__month-button"
      data-testid="transfers-month-previous-button"
      aria-label={$_('transfers.previousMonth')}
      title={$_('transfers.previousMonth')}
      on:click={handlePreviousMonthClick}
      ><span class="transfers-route__month-button-content" aria-hidden="true"
        >{$_('transfers.previousMonthButton')}</span
      ></button
    >
    <p
      class="transfers-route__month-label"
      data-testid="transfers-month-label"
      data-month-key={monthKey}
    >
      <span>{monthLabel}</span>
    </p>
    <button
      type="button"
      class="app-button app-button--secondary transfers-route__month-button"
      data-testid="transfers-month-next-button"
      aria-label={$_('transfers.nextMonth')}
      title={$_('transfers.nextMonth')}
      on:click={handleNextMonthClick}
      ><span class="transfers-route__month-button-content" aria-hidden="true"
        >{$_('transfers.nextMonthButton')}</span
      ></button
    >
  </div>

  <div
    class="transfers-route__swipe-surface"
    data-testid="transfers-month-swipe-surface"
    role="group"
    aria-label={$_('transfers.swipeArea')}
    on:touchstart={handleTouchStart}
    on:touchmove|nonpassive={handleTouchMove}
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
        {$_('transfers.loading')}
      {:else if state.operation === 'error'}
        {state.error?.message ?? $_('transfers.errorDefault')}
      {:else if state.operation === 'empty'}
        {$_('transfers.emptyStatus')}
      {:else if state.operation === 'ready'}
        {$_('transfers.countFound', { values: { count: state.transfers.length } })}
      {/if}
    </p>

    <div
      class="transfers-route__drag-track"
      style={`transform: translateX(${swipeDragOffsetX.toFixed(1)}px);`}
    >
      {#if state.operation === 'loading'}
        <div class="transfers-route__loading" data-testid="transfers-route-loading">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      {:else if state.operation === 'empty'}
        <div class="transfers-route__empty" data-testid="transfers-route-empty">
          <p>{$_('transfers.emptyBox')}</p>
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
                    <p class="transfer-card__date">
                      {formatEpochDayToDate(transfer.bookingDateEpochDay, $locale)}
                    </p>
                    <h3 class="transfer-card__name">
                      {#if transfer.buyplace}<span class="transfer-card__buyplace-prefix"
                          >({transfer.buyplace})
                        </span>
                      {/if}{transfer.name}
                    </h3>
                  </div>
                  <span
                    class="transfer-card__amount"
                    data-testid={`transfer-amount-${transfer.transferId}`}
                    >{formatAmountDisplay(
                      transfer.amountCents,
                      transfer.amountSemantic,
                      $locale,
                    )}</span
                  >
                </div>
                <div class="transfer-card__details">
                  <div class="transfer-card__accounts">
                    <span class="transfer-card__account transfer-card__account--from">
                      {#if transfer.fromAccountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID}
                        {$_('transfers.primaryIncome')}
                      {:else if transfer.fromAccountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID}
                        {$_('transfers.primarySpendings')}
                      {:else}
                        {transfer.fromAccountName}
                      {/if}
                    </span>
                    <span class="transfer-card__account-arrow">→</span>
                    <span class="transfer-card__account transfer-card__account--to">
                      {#if transfer.toAccountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID}
                        {$_('transfers.primaryIncome')}
                      {:else if transfer.toAccountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID}
                        {$_('transfers.primarySpendings')}
                      {:else}
                        {transfer.toAccountName}
                      {/if}
                    </span>
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
                </div>
              </article>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
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
    grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem;
    gap: 0.5rem;
    align-items: center;
  }

  .transfers-route__month-button {
    width: 2.5rem;
    min-width: 2.5rem;
    min-height: 2.5rem;
    padding: 0;
    font-size: 1.35rem;
    line-height: 1;
  }

  .transfers-route__month-button-content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    height: 1em;
    line-height: 1;
    transform: translateY(-0.04em);
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

  .transfers-route__drag-track {
    will-change: transform;
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
    gap: 0.2rem;
  }

  .transfers-route__card-item {
    margin: 0;
  }

  .transfer-card {
    display: flex;
    flex-direction: column;
    gap: 0.08rem;
    padding: 0.4rem 0.75rem 0.1rem;
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
    min-width: 0;
  }

  .transfer-card__date {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.1;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .transfer-card__name {
    margin: 0;
    font-size: 1rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .transfer-card__buyplace-prefix {
    font-weight: 600;
  }

  .transfer-card__amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: right;
    color: var(--text-primary);
    justify-self: end;
    line-height: 1.15;
  }

  .transfer-card--positive .transfer-card__amount {
    color: var(--amount-positive);
  }
  .transfer-card--negative .transfer-card__amount {
    color: var(--amount-negative);
  }
  .transfer-card--neutral .transfer-card__amount {
    color: var(--text-secondary);
  }

  .transfer-card__details {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
    min-width: 0;
  }

  .transfer-card__accounts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    line-height: 0.9;
    color: var(--text-secondary);
    min-width: 0;
    flex: 1 1 12rem;
  }

  .transfer-card__account {
    font-weight: 500;
    overflow-wrap: anywhere;
    min-width: 0;
  }

  .transfer-card__account-arrow {
    opacity: 0.8;
  }

  .transfer-card__categories {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    justify-content: flex-end;
    min-width: 0;
  }

  .transfer-card__category {
    margin: 0;
  }

  .app-badge {
    display: inline-block;
    padding: 0.06rem 0.45rem;
    font-size: 0.75rem;
    line-height: 1.2;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-secondary) 15%, transparent);
    color: var(--text-primary);
    overflow-wrap: anywhere;
  }

  @media (max-width: 380px) {
    .transfer-card__header {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.3rem;
    }

    .transfer-card__amount {
      justify-self: start;
      text-align: left;
    }
  }
</style>
