<!-- Shared save/error feedback; producer controllers remain owned above this view. -->
<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import type { ReceiptTransferCommitState } from '../receiptTransferCommitController';
  import type { CreateTransferInput } from '@db';
  import { formatAmountDisplay, formatEpochDayToDate } from '@shared';
  import type { AddTransferOptionsState } from '../../transfers/transferOptions';
  import type { AddTransferSaveState } from './addTransferSaveController';
  import ProgressIndicator from '../components/ProgressIndicator.svelte';
  let {
    isOptionsLoading,
    effectiveFormError,
    isOffline,
    saveState,
    remoteCommitRecoveryIsRequired,
    validationErrors,
    receiptCommitState,
    receiptSummary = [],
    optionsState,
    retryReceiptUpload,
    resolveReceiptConflict,
    retryReceiptAfterConflict,
    retryReceiptLocalCommitRecovery,
  }: {
    isOptionsLoading: boolean;
    effectiveFormError: string | null;
    isOffline: boolean;
    saveState: AddTransferSaveState;
    remoteCommitRecoveryIsRequired: boolean;
    validationErrors: readonly string[];
    receiptCommitState: ReceiptTransferCommitState;
    receiptSummary?: readonly CreateTransferInput[];
    optionsState?: AddTransferOptionsState;
    retryReceiptUpload: () => void;
    resolveReceiptConflict: () => void;
    retryReceiptAfterConflict: () => void;
    retryReceiptLocalCommitRecovery: () => void;
  } = $props();
</script>

{#if isOptionsLoading}
  <p class="add-transfer-form__status" data-testid="add-transfer-options-loading">
    {$_('addTransfer.loadingOptions')}
  </p>
{/if}

{#if effectiveFormError !== null}
  <p class="add-transfer-form__error" role="alert" data-testid="add-transfer-form-error">
    {effectiveFormError}
  </p>
{/if}

{#if isOffline}
  <p class="add-transfer-form__error" role="alert" data-testid="add-transfer-offline-warning">
    {$_('addTransfer.offlineWarning')}
  </p>
{/if}

{#if saveState.phase === 'conflict' || saveState.phase === 'conflict_syncing' || saveState.phase === 'conflict_resolved'}
  <section
    class={`add-transfer-form__conflict${saveState.phase === 'conflict_resolved' ? ' add-transfer-form__conflict--resolved' : ''}`}
    role={saveState.phase === 'conflict_resolved' ? 'status' : 'alertdialog'}
    aria-labelledby="add-transfer-conflict-title"
    aria-describedby="add-transfer-conflict-description"
    data-testid="add-transfer-conflict-dialog"
  >
    <h4 id="add-transfer-conflict-title">
      {saveState.phase === 'conflict_resolved'
        ? $_('addTransfer.save.conflictResolvedTitle')
        : $_('addTransfer.save.conflictTitle')}
    </h4>
    <p id="add-transfer-conflict-description">
      {saveState.phase === 'conflict_resolved'
        ? $_('addTransfer.save.conflictResolved')
        : $_('addTransfer.save.conflictDescription')}
    </p>
    {#if saveState.errorMessage !== null && saveState.phase === 'conflict'}
      <p class="add-transfer-form__conflict-error" role="alert">
        {saveState.errorMessage}
      </p>
    {/if}
    {#if saveState.phase === 'conflict_syncing'}
      <div class="add-transfer-form__upload" data-testid="add-transfer-conflict-sync-status">
        <p class="add-transfer-form__status">{$_('addTransfer.save.conflictSyncing')}</p>
        {#if saveState.recoveryProgress !== null}
          <ProgressIndicator
            kind="download"
            loaded={saveState.recoveryProgress.loadedBytes}
            total={saveState.recoveryProgress.totalBytes}
          />
        {/if}
      </div>
    {/if}
  </section>
{/if}

{#if remoteCommitRecoveryIsRequired}
  <section
    class="add-transfer-form__conflict add-transfer-form__conflict--resolved"
    role="status"
    data-testid="add-transfer-remote-commit-status"
  >
    <h4>{$_('addTransfer.save.remoteCommitTitle')}</h4>
    <p>
      {saveState.phase === 'remote_commit_recovery_failed'
        ? $_('addTransfer.save.remoteCommitRecoveryFailed')
        : $_('addTransfer.save.remoteCommitRecovered')}
    </p>
    {#if saveState.phase === 'remote_commit_syncing' && saveState.recoveryProgress !== null}
      <ProgressIndicator
        kind="download"
        loaded={saveState.recoveryProgress.loadedBytes}
        total={saveState.recoveryProgress.totalBytes}
      />
    {/if}
  </section>
{/if}

{#if saveState.phase === 'local_commit_syncing'}
  <p class="status-text" role="status" data-testid="add-transfer-local-recovery-status">
    {$_('addTransfer.receipt.commit.recoveringLocalCommit')}
  </p>
{/if}

{#if saveState.phase === 'local_save'}
  <p class="add-transfer-form__status" data-testid="add-transfer-local-save-status">
    {$_('addTransfer.save.localSave')}
  </p>
{/if}

{#if saveState.phase === 'uploading'}
  <div class="add-transfer-form__upload" data-testid="add-transfer-upload-status">
    <p class="add-transfer-form__status">{$_('addTransfer.save.uploading')}</p>
    {#if saveState.progress !== null}
      <ProgressIndicator
        kind="upload"
        loaded={saveState.progress.loadedBytes}
        total={saveState.progress.totalBytes}
      />
    {/if}
  </div>
{/if}

{#if saveState.phase === 'saved'}
  <p class="add-transfer-form__success" role="status" data-testid="add-transfer-success-status">
    {$_('addTransfer.save.success')}
  </p>
{/if}

{#if validationErrors.length > 0}
  {#each validationErrors as error (error)}
    <p class="add-transfer-form__error" role="alert" data-testid="add-transfer-validation-error">
      {error}
    </p>
  {/each}
{/if}

{#if receiptCommitState.phase === 'upload_failed'}
  <button
    type="button"
    class="app-button app-button--primary add-transfer-form__action"
    data-testid="receipt-upload-retry"
    disabled={isOffline}
    onclick={retryReceiptUpload}
  >
    {$_('addTransfer.receipt.commit.retryUpload')}
  </button>
{:else if receiptCommitState.phase === 'conflict'}
  <button
    type="button"
    class="app-button app-button--primary add-transfer-form__action"
    data-testid="receipt-conflict-refresh"
    disabled={isOffline}
    onclick={resolveReceiptConflict}
  >
    {$_('addTransfer.receipt.commit.refreshConflict')}
  </button>
{:else if receiptCommitState.phase === 'conflict_ready'}
  <p class="add-transfer-form__status" role="status">
    {$_('addTransfer.receipt.commit.conflictReady')}
  </p>
  <button
    type="button"
    class="app-button app-button--primary add-transfer-form__action"
    data-testid="receipt-conflict-retry"
    disabled={isOffline}
    onclick={retryReceiptAfterConflict}
  >
    {$_('addTransfer.receipt.commit.retryAfterConflict')}
  </button>
{:else if receiptCommitState.phase === 'local_commit_recovery_failed'}
  <button
    type="button"
    class="app-button app-button--primary add-transfer-form__action"
    data-testid="receipt-local-recovery-retry"
    disabled={isOffline}
    onclick={retryReceiptLocalCommitRecovery}
  >
    {$_('addTransfer.receipt.commit.retryLocalRecovery')}
  </button>
{:else if receiptCommitState.phase === 'local_commit_syncing' || receiptCommitState.phase === 'conflict_syncing' || receiptCommitState.phase === 'remote_commit_syncing'}
  <p class="add-transfer-form__status" role="status">
    {$_(
      receiptCommitState.phase === 'local_commit_syncing'
        ? 'addTransfer.receipt.commit.recoveringLocalCommit'
        : receiptCommitState.phase === 'conflict_syncing'
          ? 'addTransfer.receipt.commit.refreshingConflict'
          : 'addTransfer.receipt.commit.reconcilingRemoteCommit',
    )}
  </p>
  {#if receiptCommitState.recoveryProgress !== null}
    <ProgressIndicator
      kind="download"
      loaded={receiptCommitState.recoveryProgress.loadedBytes}
      total={receiptCommitState.recoveryProgress.totalBytes}
    />
  {/if}
{:else if receiptCommitState.phase === 'uploading' && receiptCommitState.progress !== null}
  <ProgressIndicator
    kind="upload"
    loaded={receiptCommitState.progress.loadedBytes}
    total={receiptCommitState.progress.totalBytes}
  />
{:else if receiptCommitState.phase === 'saved'}
  <p class="add-transfer-form__success" role="status" data-testid="receipt-commit-success">
    {$_(
      receiptCommitState.createdCount === 1
        ? 'addTransfer.receipt.commit.successOne'
        : 'addTransfer.receipt.commit.successMany',
      { values: { count: receiptCommitState.createdCount } },
    )}
  </p>
  {#if receiptSummary.length > 0}
    {@const shared = receiptSummary[0]!}
    {@const accountName = optionsState?.fromAccountOptions.find(
      (account) => account.accountId === shared.fromAccountId,
    )?.name}
    <div
      class="add-transfer-form__status receipt-saved-summary"
      data-testid="receipt-saved-summary"
    >
      <p data-testid="receipt-saved-context">
        {formatEpochDayToDate(shared.bookingDateEpochDay, $locale)}
        {#if shared.buyplace}
          — {shared.buyplace}{/if}
        {#if accountName}
          — {accountName}{/if}
      </p>
      <ul>
        {#each receiptSummary as command (command)}
          <li>
            <strong>{command.name}</strong>
            {#if command.categoryIds.length > 0}
              ({command.categoryIds
                .map(
                  (id) =>
                    optionsState?.categoryOptions.find((category) => category.categoryId === id)
                      ?.name ?? String(id),
                )
                .join(' / ')})
            {/if}
            —
            <span class="receipt-saved-summary__amount">
              {formatAmountDisplay(command.amountCents, 'neutral', $locale)}
            </span>
          </li>
        {/each}
      </ul>
      <p>{$_('addTransfer.receipt.correction')}</p>
    </div>
  {/if}
{:else if receiptCommitState.phase === 'remote_commit_recovery_failed'}
  <p class="add-transfer-form__error" role="alert" data-testid="receipt-remote-saved">
    {$_('addTransfer.receipt.commit.remoteCommitRecoveryFailed')}
  </p>
{/if}

<style>
  .receipt-saved-summary {
    display: grid;
    gap: 0.75rem;
    overflow-wrap: anywhere;
  }

  .receipt-saved-summary p,
  .receipt-saved-summary ul {
    margin: 0;
  }

  .receipt-saved-summary ul {
    padding-left: 1.25rem;
  }

  .receipt-saved-summary li + li {
    margin-top: 0.25rem;
  }

  .receipt-saved-summary__amount {
    white-space: nowrap;
  }
</style>
