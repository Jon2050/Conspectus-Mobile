<!-- Renders visible non-primary account balances from the local SQLite database. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createAccountQueryService } from '@db';
  import { appSyncStateStore, type SyncState } from '@shared';

  import SkeletonCard from '../components/SkeletonCard.svelte';
  import {
    createAccountsRouteController,
    type AccountsRouteController,
    type AccountsRouteState,
  } from './accountsRouteController';
  import { resolveAppDbRuntime } from '../dbRuntimeResolver';

  export let controller: AccountsRouteController = createAccountsRouteController(
    createAccountQueryService(resolveAppDbRuntime()),
  );

  let state: AccountsRouteState = controller.getState();
  let lastObservedSyncState: SyncState = 'idle';

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
      void controller.load();
    }
  });

  onMount(() => {
    void controller.load();
  });

  onDestroy(() => {
    unsubscribeController();
    unsubscribeSyncState();
  });
</script>

<section
  class="accounts-route"
  data-testid="route-accounts"
  aria-busy={state.operation === 'loading'}
>
  <h2>Accounts</h2>
  <p class="accounts-route__lede">Visible non-primary balances from the local SQLite database.</p>

  <p
    class="accounts-route__status"
    class:accounts-route__status--error={state.operation === 'error'}
    data-testid="accounts-route-status"
    aria-live="polite"
    role={state.operation === 'error' ? 'alert' : undefined}
  >
    {#if state.operation === 'loading'}
      Loading accounts from the local database...
    {:else if state.operation === 'error'}
      {state.error?.message ?? 'Failed to load accounts.'}
    {:else if state.operation === 'empty'}
      No visible non-primary accounts found or no DB file is ready.
    {:else}
      {state.accounts.length} accounts loaded.
    {/if}
  </p>

  {#if state.operation === 'loading'}
    <div class="accounts-route__loading" data-testid="accounts-route-loading">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  {:else if state.operation === 'empty'}
    <div class="accounts-route__empty" data-testid="accounts-route-empty">
      <p>
        No accounts match the visible non-primary filter yet. If you have not selected a DB file,
        open Settings and bind your OneDrive database.
      </p>
    </div>
  {:else if state.operation === 'ready'}
    <ul class="accounts-route__cards" data-testid="accounts-route-cards">
      {#each state.accounts as account (account.accountId)}
        <li class="accounts-route__card-item">
          <article
            class={`account-card account-card--${account.amountSemantic}`}
            data-testid={`account-card-${account.accountId}`}
            data-account-id={account.accountId}
            data-account-semantic={account.amountSemantic}
          >
            <div class="account-card__header">
              <h3 class="account-card__name">{account.name}</h3>
              <span
                class="account-card__amount"
                data-testid={`account-amount-${account.amountSemantic}-${account.accountId}`}
                data-amount-semantic={account.amountSemantic}
                data-account-id={account.accountId}
                data-amount-cents={account.amountCents}
              >
                {account.amountDisplay}
              </span>
            </div>

            <p class="account-card__meta">Account ID {account.accountId}</p>
          </article>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .accounts-route {
    --accounts-amount-positive: #0f6b43;
    --accounts-amount-negative: #b42318;
    --accounts-amount-neutral: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  @media (prefers-color-scheme: dark) {
    .accounts-route {
      --accounts-amount-positive: #34d399;
      --accounts-amount-negative: #fca5a5;
      --accounts-amount-neutral: #d1d5db;
    }
  }

  .accounts-route__lede,
  .accounts-route__status,
  .accounts-route__empty p,
  .account-card__meta {
    margin: 0;
    color: var(--text-secondary);
  }

  .accounts-route__status {
    min-height: 1.5rem;
  }

  .accounts-route__status--error {
    padding: 1rem;
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--negative) 72%, var(--text-primary));
    background: color-mix(in srgb, var(--negative) 14%, var(--surface-strong));
  }

  .accounts-route__loading,
  .accounts-route__empty {
    display: grid;
    gap: 0.75rem;
  }

  .accounts-route__empty {
    padding: 1rem;
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .accounts-route__cards {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }

  .accounts-route__card-item {
    margin: 0;
  }

  .account-card {
    display: grid;
    gap: 0.55rem;
    padding: 1rem;
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
    border-left: 4px solid var(--accent);
  }

  .account-card--positive {
    border-left-color: var(--positive);
  }

  .account-card--negative {
    border-left-color: var(--negative);
  }

  .account-card--neutral {
    border-left-color: var(--accent);
  }

  .account-card__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: start;
  }

  .account-card__name {
    margin: 0;
    font-size: 1rem;
    line-height: 1.2;
    word-break: break-word;
  }

  .account-card__amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: right;
    color: var(--text-primary);
  }

  .account-card--positive .account-card__amount {
    color: var(--accounts-amount-positive);
  }

  .account-card--negative .account-card__amount {
    color: var(--accounts-amount-negative);
  }

  .account-card--neutral .account-card__amount {
    color: var(--accounts-amount-neutral);
  }
</style>
