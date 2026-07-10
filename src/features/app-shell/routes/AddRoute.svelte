<!-- Renders the Add Transfer bottom-sheet form with all MVP fields for mobile data entry. -->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    appAccountQueryService,
    appCategoryQueryService,
    PRIMARY_INCOME_ACCOUNT_TYPE_ID,
    PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
  } from '@db';
  import {
    appSyncStateStore,
    appNetworkStateStore,
    type SyncState,
    type SyncStateStore,
    type NetworkStateStore,
  } from '@shared';
  import BottomSheet from '../components/BottomSheet.svelte';
  import ProgressIndicator from '../components/ProgressIndicator.svelte';
  import {
    createInitialFormFields,
    NO_CATEGORY_SELECTED,
    type AddTransferFormFields,
  } from './addTransferFormState';
  import {
    createAddTransferOptionsController,
    shouldReloadAddTransferOptionsForSyncState,
    type AddTransferOptionsController,
    type AddTransferOptionsState,
  } from './addTransferOptionsController';
  import {
    createAddTransferSaveController,
    type AddTransferSaveController,
    type AddTransferSaveState,
  } from './addTransferSaveController';
  import {
    appendAmountInputDigit,
    formatAmountInputValue,
    removeLastAmountInputDigit,
  } from './addTransferAmountInput';

  export let controller: AddTransferOptionsController = createAddTransferOptionsController(
    appAccountQueryService,
    appCategoryQueryService,
  );
  export let saveController: AddTransferSaveController = createAddTransferSaveController();
  export let fields: AddTransferFormFields = createInitialFormFields();
  export let isSubmitting = false;
  export let formError: string | null = null;
  export let syncStateStore: SyncStateStore = appSyncStateStore;
  export let networkStateStore: NetworkStateStore = appNetworkStateStore;
  export let canOpenPanel = true;

  let isOpen = true;
  let componentHasMounted = false;
  let hasRequestedOptionsLoad = false;
  let formElement: HTMLFormElement | null = null;
  let amountInputElement: HTMLInputElement | null = null;
  let optionsState: AddTransferOptionsState = controller.getState();
  let saveState: AddTransferSaveState = saveController.getState();
  let lastObservedSyncState: SyncState = 'idle';
  $: isOffline = !$networkStateStore;
  $: isOptionsLoading = optionsState.operation === 'loading';
  $: saveIsBusy =
    saveState.phase === 'local_save' ||
    saveState.phase === 'uploading' ||
    saveState.phase === 'conflict_syncing' ||
    saveState.phase === 'remote_commit_syncing';
  $: conflictRecoveryIsRequired =
    saveState.phase === 'conflict' || saveState.phase === 'conflict_syncing';
  $: remoteCommitRecoveryIsRequired =
    saveState.phase === 'remote_commit_syncing' ||
    saveState.phase === 'remote_commit_recovered' ||
    saveState.phase === 'remote_commit_recovery_failed';
  $: saveBlocksFormExit = saveState.canRetry || conflictRecoveryIsRequired;
  $: saveBlocksEditing =
    saveState.canRetry || conflictRecoveryIsRequired || remoteCommitRecoveryIsRequired;
  $: effectiveFormError =
    formError ??
    (conflictRecoveryIsRequired ? null : saveState.errorMessage) ??
    optionsState.error?.message ??
    null;
  $: controlsAreDisabled = isSubmitting || isOptionsLoading || saveIsBusy || saveBlocksEditing;
  $: submitIsDisabled = controlsAreDisabled || isOffline || optionsState.operation !== 'ready';

  let validationErrors: string[] = [];
  const allowedAmountNavigationKeys = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

  const clearValidation = (): void => {
    if (validationErrors.length > 0) {
      validationErrors = [];
    }
  };

  const resetSuccessfulSave = (): void => {
    if (saveController.getState().phase === 'saved') {
      fields = createInitialFormFields();
    }
  };

  const scrollFormToTop = async (): Promise<void> => {
    await tick();
    formElement?.parentElement?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const requestOptionsLoad = (): void => {
    hasRequestedOptionsLoad = true;
    void controller.load();
  };

  const focusAmountInputEnd = async (): Promise<void> => {
    await tick();
    const valueLength = amountInputElement?.value.length ?? 0;
    amountInputElement?.setSelectionRange(valueLength, valueLength);
  };

  const updateAmountValue = (nextValue: string): void => {
    fields.amount = nextValue;
    clearValidation();
    void focusAmountInputEnd();
  };

  const handleAmountKeydown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      updateAmountValue(appendAmountInputDigit(fields.amount, event.key));
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      updateAmountValue(removeLastAmountInputDigit(fields.amount));
      return;
    }

    if (!allowedAmountNavigationKeys.has(event.key)) {
      event.preventDefault();
    }
  };

  const handleAmountInput = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    updateAmountValue(formatAmountInputValue(input.value));
  };

  const handleAmountPaste = (event: ClipboardEvent): void => {
    event.preventDefault();
    updateAmountValue(formatAmountInputValue(event.clipboardData?.getData('text') ?? ''));
  };

  const handleSubmit = async (): Promise<void> => {
    const result = await saveController.submit(fields, optionsState, $_, isOffline);
    validationErrors = [...result.validationErrors];
    const saveCompleted = saveController.getState().phase === 'saved';
    resetSuccessfulSave();
    if (validationErrors.length > 0 || saveCompleted) {
      await scrollFormToTop();
    }
  };

  const handleRetry = async (): Promise<void> => {
    await saveController.retry($_, isOffline);
    const saveCompleted = saveController.getState().phase === 'saved';
    resetSuccessfulSave();
    if (saveCompleted) {
      await scrollFormToTop();
    }
  };

  const handleResolveConflict = async (): Promise<void> => {
    await saveController.resolveConflict($_, isOffline);
  };

  const getAccountName = (account: { name: string; accountTypeId: number | null }) => {
    if (account.accountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID) {
      return $_('transfers.primaryIncome');
    }
    if (account.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID) {
      return $_('transfers.primarySpendings');
    }
    return account.name;
  };

  const navIconBaseUrl = import.meta.env.BASE_URL;
  const categoryIconUrl = `${navIconBaseUrl}icons/category_55.png`;
  const unsubscribeController = controller.subscribe((nextState) => {
    optionsState = nextState;
  });
  const unsubscribeSaveController = saveController.subscribe((nextState) => {
    saveState = nextState;
  });
  const unsubscribeSyncState = syncStateStore.subscribe((syncSnapshot) => {
    if (syncSnapshot.state === lastObservedSyncState) {
      return;
    }

    lastObservedSyncState = syncSnapshot.state;
    if (shouldReloadAddTransferOptionsForSyncState(syncSnapshot.state)) {
      void controller.load();
    }
  });

  const handleClose = (): void => {
    if (saveIsBusy || saveBlocksFormExit) {
      return;
    }

    isOpen = false;
    if (typeof window !== 'undefined') {
      window.location.hash = '#/transfers';
    }
  };

  const handleReopen = (): void => {
    saveController.reset();
    isOpen = true;
  };

  $: if (componentHasMounted && canOpenPanel && !hasRequestedOptionsLoad) {
    requestOptionsLoad();
  }

  $: if (canOpenPanel && !isOpen) {
    isOpen = true;
  }

  onMount(() => {
    componentHasMounted = true;
    if (canOpenPanel) {
      requestOptionsLoad();
    }
  });

  onDestroy(() => {
    unsubscribeController();
    unsubscribeSaveController();
    unsubscribeSyncState();
  });
</script>

<section class="add-route" data-testid="route-add">
  {#if !canOpenPanel}
    <div
      class="add-route__closed add-route__closed--info"
      role="status"
      data-testid="add-transfer-database-required"
    >
      <p>{$_('addTransfer.databaseRequired')}</p>
    </div>
  {:else}
    {#if !isOpen}
      <div class="add-route__closed" data-testid="add-route-closed">
        <p>{$_('addTransfer.title')}</p>
        <button
          type="button"
          class="app-button app-button--primary"
          data-testid="add-route-reopen-button"
          on:click={handleReopen}>{$_('addTransfer.submit')}</button
        >
      </div>
    {/if}

    <BottomSheet
      {isOpen}
      canClose={!saveIsBusy && !saveBlocksFormExit}
      title={$_('addTransfer.title')}
      on:close={handleClose}
    >
      <form
        bind:this={formElement}
        class="add-transfer-form"
        data-testid="add-transfer-form"
        aria-busy={isSubmitting || isOptionsLoading || saveIsBusy}
        on:submit|preventDefault={handleSubmit}
        on:input={clearValidation}
        on:change={clearValidation}
      >
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
          <p
            class="add-transfer-form__error"
            role="alert"
            data-testid="add-transfer-offline-warning"
          >
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
              <div
                class="add-transfer-form__upload"
                data-testid="add-transfer-conflict-sync-status"
              >
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
          <p
            class="add-transfer-form__success"
            role="status"
            data-testid="add-transfer-success-status"
          >
            {$_('addTransfer.save.success')}
          </p>
        {/if}

        {#if validationErrors.length > 0}
          {#each validationErrors as error (error)}
            <p
              class="add-transfer-form__error"
              role="alert"
              data-testid="add-transfer-validation-error"
            >
              {error}
            </p>
          {/each}
        {/if}

        <div class="add-transfer-form__field">
          <label class="add-transfer-form__label" for="add-transfer-date"
            >{$_('addTransfer.date')}</label
          >
          <input
            id="add-transfer-date"
            type="date"
            class="app-input"
            data-testid="add-transfer-date"
            bind:value={fields.date}
            disabled={controlsAreDisabled}
            required
          />
        </div>

        <div class="add-transfer-form__field">
          <label class="add-transfer-form__label" for="add-transfer-name"
            >{$_('addTransfer.name')}</label
          >
          <input
            id="add-transfer-name"
            type="text"
            class="app-input"
            data-testid="add-transfer-name"
            placeholder={$_('addTransfer.namePlaceholder')}
            bind:value={fields.name}
            disabled={controlsAreDisabled}
            autocomplete="off"
          />
        </div>

        <div class="add-transfer-form__field">
          <label class="add-transfer-form__label" for="add-transfer-buyplace"
            >{$_('addTransfer.buyplace')}</label
          >
          <input
            id="add-transfer-buyplace"
            type="text"
            class="app-input"
            data-testid="add-transfer-buyplace"
            placeholder={$_('addTransfer.buyplacePlaceholder')}
            bind:value={fields.buyplace}
            disabled={controlsAreDisabled}
            autocomplete="off"
          />
        </div>

        <div class="add-transfer-form__field">
          <label class="add-transfer-form__label" for="add-transfer-amount"
            >{$_('addTransfer.amount')}</label
          >
          <input
            bind:this={amountInputElement}
            id="add-transfer-amount"
            type="text"
            inputmode="numeric"
            class="app-input"
            data-testid="add-transfer-amount"
            placeholder={$_('addTransfer.amountPlaceholder')}
            bind:value={fields.amount}
            disabled={controlsAreDisabled}
            autocomplete="off"
            on:keydown={handleAmountKeydown}
            on:input={handleAmountInput}
            on:paste={handleAmountPaste}
          />
        </div>

        <div class="add-transfer-form__field">
          <label class="add-transfer-form__label" for="add-transfer-from-account"
            >{$_('addTransfer.fromAccount')}</label
          >
          <select
            id="add-transfer-from-account"
            class="app-input"
            data-testid="add-transfer-from-account"
            bind:value={fields.fromAccountId}
            disabled={controlsAreDisabled}
          >
            <option value={null}>{$_('addTransfer.fromAccountPlaceholder')}</option>
            {#each optionsState.fromAccountOptions as account (account.accountId)}
              <option value={account.accountId}>{getAccountName(account)}</option>
            {/each}
          </select>
        </div>

        <div class="add-transfer-form__field">
          <label class="add-transfer-form__label" for="add-transfer-to-account"
            >{$_('addTransfer.toAccount')}</label
          >
          <select
            id="add-transfer-to-account"
            class="app-input"
            data-testid="add-transfer-to-account"
            bind:value={fields.toAccountId}
            disabled={controlsAreDisabled}
          >
            <option value={null}>{$_('addTransfer.toAccountPlaceholder')}</option>
            {#each optionsState.toAccountOptions as account (account.accountId)}
              <option value={account.accountId}>{getAccountName(account)}</option>
            {/each}
          </select>
        </div>

        <div class="add-transfer-form__field">
          <div class="add-transfer-form__label-row">
            <img
              class="add-transfer-form__category-icon"
              src={categoryIconUrl}
              alt=""
              aria-hidden="true"
              width="20"
              height="20"
            />
            <label class="add-transfer-form__label" for="add-transfer-category-1"
              >{$_('addTransfer.categories')}</label
            >
          </div>
          <div class="add-transfer-form__category-selects">
            <select
              id="add-transfer-category-1"
              class="app-input"
              data-testid="add-transfer-category-1"
              bind:value={fields.category1Id}
              disabled={controlsAreDisabled}
            >
              <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
              {#each optionsState.categoryOptions as cat (cat.categoryId)}
                <option value={cat.categoryId}>{cat.name}</option>
              {/each}
            </select>
            <select
              id="add-transfer-category-2"
              class="app-input"
              data-testid="add-transfer-category-2"
              bind:value={fields.category2Id}
              disabled={controlsAreDisabled}
            >
              <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
              {#each optionsState.categoryOptions as cat (cat.categoryId)}
                <option value={cat.categoryId}>{cat.name}</option>
              {/each}
            </select>
            <select
              id="add-transfer-category-3"
              class="app-input"
              data-testid="add-transfer-category-3"
              bind:value={fields.category3Id}
              disabled={controlsAreDisabled}
            >
              <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
              {#each optionsState.categoryOptions as cat (cat.categoryId)}
                <option value={cat.categoryId}>{cat.name}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="add-transfer-form__actions">
          <button
            type="button"
            class="app-button app-button--secondary add-transfer-form__action"
            data-testid="add-transfer-close"
            disabled={isSubmitting || saveIsBusy || saveBlocksFormExit}
            on:click={handleClose}
          >
            {$_('addTransfer.close')}
          </button>
          {#if saveState.canRetry}
            <button
              type="button"
              class="app-button app-button--primary add-transfer-form__action"
              data-testid="add-transfer-retry"
              disabled={saveIsBusy || isOffline}
              on:click={handleRetry}
            >
              {$_('addTransfer.save.retry')}
            </button>
          {:else if saveState.phase === 'conflict' || saveState.phase === 'conflict_syncing'}
            <button
              type="button"
              class="app-button app-button--primary add-transfer-form__action"
              data-testid="add-transfer-resolve-conflict"
              disabled={saveState.phase === 'conflict_syncing' || isOffline}
              on:click={handleResolveConflict}
            >
              {saveState.phase === 'conflict_syncing'
                ? $_('addTransfer.save.conflictSyncingButton')
                : $_('addTransfer.save.conflictAction')}
            </button>
          {:else}
            <button
              type="submit"
              class="app-button app-button--primary add-transfer-form__action"
              data-testid="add-transfer-submit"
              disabled={submitIsDisabled}
            >
              {saveIsBusy || isSubmitting ? $_('addTransfer.saving') : $_('addTransfer.submit')}
            </button>
          {/if}
        </div>
      </form>
    </BottomSheet>
  {/if}
</section>

<style>
  .add-route {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .add-route__closed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem 1rem;
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
    text-align: center;
  }

  .add-route__closed p {
    margin: 0;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .add-transfer-form {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding-bottom: 0.5rem;
  }

  .add-transfer-form__error {
    margin: 0;
    padding: 0.8rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--error) 45%, transparent);
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--error) 76%, black);
    background: color-mix(in srgb, var(--error) 10%, var(--surface-strong));
    font-size: 0.9rem;
    font-weight: 600;
  }

  .add-transfer-form__success {
    margin: 0;
    padding: 0.8rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--positive) 45%, transparent);
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--positive) 76%, black);
    background: color-mix(in srgb, var(--positive) 10%, var(--surface-strong));
    font-size: 0.9rem;
    font-weight: 600;
  }

  .add-transfer-form__status {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .add-transfer-form__upload {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .add-transfer-form__conflict {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin: 0;
    padding: 0.9rem;
    border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-strong));
    color: var(--text-primary);
  }

  .add-transfer-form__conflict--resolved {
    border-color: color-mix(in srgb, var(--positive) 42%, transparent);
    background: color-mix(in srgb, var(--positive) 10%, var(--surface-strong));
  }

  .add-transfer-form__conflict h4,
  .add-transfer-form__conflict p {
    margin: 0;
  }

  .add-transfer-form__conflict h4 {
    font-size: 1rem;
    font-weight: 700;
  }

  .add-transfer-form__conflict p {
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .add-transfer-form__conflict-error {
    font-weight: 700;
    color: color-mix(in srgb, var(--error) 76%, black);
  }

  .add-transfer-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .add-transfer-form__label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .add-transfer-form__label-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .add-transfer-form__category-icon {
    flex: none;
    object-fit: contain;
    opacity: 0.7;
  }

  .add-transfer-form__category-selects {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .add-transfer-form input[type='date'].app-input {
    display: block;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: 44px;
    min-height: 44px;
    line-height: 1.2;
  }

  .add-transfer-form input[type='date'].app-input::-webkit-date-and-time-value {
    min-height: 1.2em;
    text-align: left;
  }

  @media (hover: hover) and (pointer: fine) {
    .add-transfer-form select.app-input {
      appearance: none;
      padding-right: 2.75rem;
      background-image:
        linear-gradient(45deg, transparent 50%, currentColor 50%),
        linear-gradient(135deg, currentColor 50%, transparent 50%);
      background-position:
        calc(100% - 1.35rem) 50%,
        calc(100% - 1.05rem) 50%;
      background-repeat: no-repeat;
      background-size: 0.35rem 0.35rem;
    }
  }

  .add-transfer-form__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .add-transfer-form__action {
    width: 100%;
  }

  @media (max-width: 360px) {
    .add-transfer-form__actions {
      grid-template-columns: 1fr;
    }
  }
</style>
