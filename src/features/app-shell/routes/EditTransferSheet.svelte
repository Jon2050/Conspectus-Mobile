<!-- Edits the existing booking with the same manual fields as transfer creation. -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    appAccountQueryService,
    appCategoryQueryService,
    type AccountRecord,
    type TransferRecord,
  } from '@db';
  import { appNetworkStateStore, type NetworkStateStore } from '@shared';
  import BottomSheet from '../components/BottomSheet.svelte';
  import ProgressIndicator from '../components/ProgressIndicator.svelte';
  import ManualTransferForm from './ManualTransferForm.svelte';
  import { createAddTransferOptionsController } from './addTransferOptionsController';
  import { transferToFormFields, type EditTransferController } from './editTransferController';
  import './addTransfer.css';

  export let transfer: TransferRecord;
  export let controller: EditTransferController;
  export let isOpen = true;
  export let onClose: () => void = () => {};
  export let networkStateStore: NetworkStateStore = appNetworkStateStore;
  let fields = transferToFormFields(transfer);
  const includeOriginalAccount = (
    accounts: readonly AccountRecord[],
    accountId: number,
  ): readonly AccountRecord[] => {
    if (accounts.some((account) => account.accountId === accountId)) return accounts;
    const original = appAccountQueryService
      .listAllAccounts()
      .find((account) => account.accountId === accountId);
    return original === undefined ? accounts : [...accounts, original];
  };
  const optionsController = createAddTransferOptionsController(
    {
      listAddTransferFromAccountOptions: () =>
        includeOriginalAccount(
          appAccountQueryService.listAddTransferFromAccountOptions(),
          transfer.fromAccountId,
        ),
      listAddTransferToAccountOptions: () =>
        includeOriginalAccount(
          appAccountQueryService.listAddTransferToAccountOptions(),
          transfer.toAccountId,
        ),
    },
    appCategoryQueryService,
  );
  let optionsState = optionsController.getState();
  let state = controller.getState();
  let validationErrors: readonly string[] = [];
  let deleteConfirmationIsOpen = false;
  const unsubscribe = controller.subscribe((next) => {
    state = next;
  });
  const unsubscribeOptions = optionsController.subscribe((next) => {
    optionsState = next;
  });
  onMount(() => {
    void optionsController.load();
  });
  onDestroy(() => {
    unsubscribe();
    unsubscribeOptions();
  });
  $: if (!isOpen) deleteConfirmationIsOpen = false;
  $: offline = !$networkStateStore;
  $: busy = [
    'validating',
    'local_save',
    'uploading',
    'conflict_syncing',
    'remote_commit_syncing',
    'local_commit_syncing',
  ].includes(state.phase);
  $: editable = ['idle', 'failed'].includes(state.phase);
  $: disabled = offline || !editable || optionsState.operation !== 'ready';
  const close = () => {
    if (busy || deleteConfirmationIsOpen) return;
    isOpen = false;
    onClose();
  };
  const confirmDelete = () => {
    if (disabled) return;
    deleteConfirmationIsOpen = false;
    void controller.remove(optionsState, $_, offline);
  };
  const submit = async () => {
    validationErrors = await controller.submit(fields, optionsState, $_, offline);
  };
  const refreshConflict = async () => {
    await controller.resolveConflict(async () => {
      await optionsController.load();
      return optionsController.getState();
    }, $_);
  };
</script>

<BottomSheet
  bind:isOpen
  title={$_('editTransfer.title')}
  showCloseButton={false}
  closeLabel={$_('addTransfer.close')}
  canClose={!busy && !deleteConfirmationIsOpen}
  {onClose}
>
  {#snippet headerActions()}
    <button
      type="button"
      class="app-button edit-transfer-delete"
      data-testid="edit-transfer-delete"
      {disabled}
      on:click={() => {
        deleteConfirmationIsOpen = true;
      }}>{$_('editTransfer.delete')}</button
    >
  {/snippet}
  <form
    class="add-transfer-form"
    data-testid="edit-transfer-form"
    on:submit|preventDefault={submit}
  >
    <details class="edit-transfer-hint" data-testid="edit-transfer-balance-hint">
      <summary>{$_('editTransfer.balanceHintTitle')}</summary>
      <p>{$_('editTransfer.balanceHint')}</p>
    </details>
    <ManualTransferForm
      bind:fields
      {optionsState}
      controlsAreDisabled={disabled}
      sourceAccountIsDisabled={disabled}
      clearValidation={() => {
        validationErrors = [];
      }}
    />
    {#if optionsState.operation === 'loading'}
      <p class="add-transfer-form__status">{$_('addTransfer.loadingOptions')}</p>
    {:else if optionsState.operation === 'error'}
      <p class="add-transfer-form__error" role="alert">
        {$_('addTransfer.validation.optionsUnavailable')}
      </p>
    {/if}
    {#each validationErrors as error (error)}
      <p class="add-transfer-form__error" role="alert">{error}</p>
    {/each}
    {#if offline}<p class="add-transfer-form__error" role="alert">
        {$_('addTransfer.offlineWarning')}
      </p>{/if}
    {#if state.error !== null}
      <p class="add-transfer-form__error" role="alert" data-testid="edit-transfer-error">
        {$_(
          state.error.code === 'local_failed'
            ? 'editTransfer.localFailed'
            : `addTransfer.receipt.commit.errors.${state.error.code}`,
        )}
      </p>
    {/if}
    {#if busy}
      <p class="add-transfer-form__status" role="status">
        {$_(
          state.phase === 'uploading'
            ? 'addTransfer.save.uploading'
            : state.phase === 'local_save'
              ? 'addTransfer.save.localSave'
              : 'addTransfer.receipt.commit.refreshingConflict',
        )}
      </p>
      {#if state.progress !== null}<ProgressIndicator
          kind="upload"
          loaded={state.progress.loadedBytes}
          total={state.progress.totalBytes}
        />{/if}
      {#if state.recoveryProgress !== null}<ProgressIndicator
          kind="download"
          loaded={state.recoveryProgress.loadedBytes}
          total={state.recoveryProgress.totalBytes}
        />{/if}
    {/if}
    {#if state.phase === 'conflict_ready'}
      <p class="add-transfer-form__status">{$_('editTransfer.conflictReady')}</p>
    {:else if state.phase === 'remote_commit_recovery_failed'}
      <p class="add-transfer-form__error" role="alert">
        {$_('addTransfer.receipt.commit.remoteCommitRecoveryFailed')}
      </p>
    {/if}
    <div class="add-transfer-form__actions">
      <button
        type="button"
        class="app-button app-button--secondary add-transfer-form__action"
        data-testid="edit-transfer-close"
        disabled={busy}
        on:click={close}>{$_('addTransfer.close')}</button
      >
      {#if state.phase === 'upload_failed'}
        <button
          type="button"
          class="app-button app-button--primary"
          data-testid="edit-transfer-retry"
          disabled={offline}
          on:click={() => controller.retry($_, offline)}>{$_('addTransfer.save.retry')}</button
        >
      {:else if state.phase === 'conflict'}
        <button
          type="button"
          class="app-button app-button--primary"
          disabled={offline}
          data-testid="edit-transfer-conflict-refresh"
          on:click={refreshConflict}>{$_('addTransfer.save.conflictAction')}</button
        >
      {:else if state.phase === 'conflict_ready'}
        <button
          type="button"
          class="app-button app-button--primary"
          disabled={offline}
          data-testid="edit-transfer-conflict-retry"
          on:click={() => controller.retryAfterConflict($_, offline)}
          >{$_('addTransfer.receipt.commit.retryAfterConflict')}</button
        >
      {:else if state.phase === 'local_commit_recovery_failed'}
        <button
          type="button"
          class="app-button app-button--primary"
          disabled={offline}
          on:click={() => controller.retryLocalRecovery($_)}
          >{$_('addTransfer.receipt.commit.retryLocalRecovery')}</button
        >
      {:else if state.phase !== 'remote_commit_recovery_failed'}
        <button
          type="submit"
          class="app-button app-button--primary add-transfer-form__action"
          data-testid="edit-transfer-submit"
          {disabled}>{$_('editTransfer.save')}</button
        >
      {/if}
    </div>
  </form>
</BottomSheet>

<BottomSheet
  bind:isOpen={deleteConfirmationIsOpen}
  title={$_('editTransfer.confirmDeleteTitle')}
  showCloseButton={false}
  canClose={!busy}
>
  <div
    class="add-transfer-form edit-transfer-confirmation"
    data-testid="edit-transfer-delete-confirmation"
  >
    <p>{$_('editTransfer.confirmDeleteDescription', { values: { name: transfer.name } })}</p>
    <div class="add-transfer-form__actions">
      <button
        type="button"
        class="app-button app-button--secondary add-transfer-form__action"
        data-testid="edit-transfer-delete-cancel"
        on:click={() => {
          deleteConfirmationIsOpen = false;
        }}>{$_('editTransfer.cancelDelete')}</button
      >
      <button
        type="button"
        class="app-button app-button--danger add-transfer-form__action"
        data-testid="edit-transfer-delete-confirm"
        {disabled}
        on:click={confirmDelete}>{$_('editTransfer.delete')}</button
      >
    </div>
  </div>
</BottomSheet>

<style>
  .edit-transfer-confirmation p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .edit-transfer-hint {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
  .edit-transfer-hint summary {
    cursor: pointer;
    padding-block: 0.35rem;
  }
  .edit-transfer-hint p {
    margin: 0.35rem 0;
  }
  .edit-transfer-delete {
    color: var(--amount-negative);
    border: 1px solid currentColor;
    flex: none;
  }
</style>
