<!-- Renders manual Add Transfer entry and the transient staged receipt-preparation workflow. -->
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
  import {
    createReceiptTransferPreparationController,
    listReceiptSourceAccountOptions,
  } from '../../receipt';
  import type {
    ReceiptAnalysisController,
    ReceiptAnalysisState,
    ReceiptCaptureController,
    ReceiptCaptureState,
    ReceiptTransferPreparationController,
    ReceiptTransferPreparationError,
    ReceiptTransferPreparationState,
  } from '../../receipt';
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
  export let receiptCaptureController: ReceiptCaptureController | null = null;
  export let receiptAnalysisController: ReceiptAnalysisController | null = null;
  export let receiptPreparationController: ReceiptTransferPreparationController =
    createReceiptTransferPreparationController();

  let isOpen = true;
  let componentHasMounted = false;
  let hasRequestedOptionsLoad = false;
  let formElement: HTMLFormElement | null = null;
  let amountInputElement: HTMLInputElement | null = null;
  let receiptFileInputElement: HTMLInputElement | null = null;
  let optionsState: AddTransferOptionsState = controller.getState();
  let saveState: AddTransferSaveState = saveController.getState();
  let receiptCaptureState: ReceiptCaptureState = receiptCaptureController?.getState() ?? {
    phase: 'idle',
    errorCode: null,
  };
  let receiptAnalysisState: ReceiptAnalysisState = receiptAnalysisController?.getState() ?? {
    phase: 'idle',
    stage: null,
    errorCode: null,
    errorReason: null,
    derivation: null,
    extractedItemIndexes: null,
  };
  let receiptPreparationState: ReceiptTransferPreparationState =
    receiptPreparationController.getState();
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
  $: saveBlocksEditing =
    saveState.canRetry || conflictRecoveryIsRequired || remoteCommitRecoveryIsRequired;
  $: receiptCaptureIsBusy =
    receiptCaptureState.phase === 'normalizing' ||
    receiptCaptureState.phase === 'handed_off' ||
    receiptAnalysisState.phase === 'extracting' ||
    receiptAnalysisState.phase === 'deriving';
  $: receiptWorkflowIsActive = receiptPreparationState.phase !== 'idle';
  $: receiptSourceAccountOptions = listReceiptSourceAccountOptions(optionsState);
  const translateReceiptPreparationError = (
    error: ReceiptTransferPreparationError | null,
  ): string | null => {
    if (error === null) return null;
    const detail =
      error.code === 'invalid_transfer' && error.detail?.startsWith('addTransfer.')
        ? $_(error.detail)
        : error.detail;
    return $_(`addTransfer.receipt.preparationErrors.${error.code}`, {
      values: { detail: detail ?? '' },
    });
  };
  $: receiptPreparationError = translateReceiptPreparationError(receiptPreparationState.error);
  $: receiptAnalysisError =
    receiptAnalysisState.phase !== 'error' || receiptAnalysisState.errorCode === null
      ? null
      : receiptAnalysisState.errorReason === null
        ? $_(`addTransfer.receipt.analysisErrors.${receiptAnalysisState.errorCode}`)
        : `${$_(`addTransfer.receipt.analysisErrors.${receiptAnalysisState.errorCode}`)} ${receiptAnalysisState.errorReason}`;
  $: receiptCaptureError =
    receiptPreparationError ??
    receiptAnalysisError ??
    (receiptCaptureState.errorCode === null
      ? null
      : $_(`addTransfer.receipt.errors.${receiptCaptureState.errorCode}`));
  $: effectiveFormError =
    formError ??
    receiptCaptureError ??
    (conflictRecoveryIsRequired ? null : saveState.errorMessage) ??
    optionsState.error?.message ??
    null;
  $: controlsAreDisabled =
    isSubmitting || isOptionsLoading || saveIsBusy || saveBlocksEditing || receiptCaptureIsBusy;
  $: sourceAccountIsDisabled = isSubmitting || isOptionsLoading || saveIsBusy || saveBlocksEditing;
  $: submitIsDisabled = controlsAreDisabled || isOffline || optionsState.operation !== 'ready';
  $: receiptCaptureIsDisabled =
    receiptCaptureController === null ||
    controlsAreDisabled ||
    isOffline ||
    optionsState.operation !== 'ready';

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

  const openReceiptCapture = (): void => {
    if (!receiptCaptureIsDisabled) {
      receiptFileInputElement?.click();
    }
  };

  const handleReceiptFileChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (file === null || receiptCaptureController === null) {
      return;
    }

    clearValidation();
    receiptPreparationController.beginRun();
    void receiptCaptureController.capture(file);
  };

  const handleReceiptSourceAccountChange = (event: Event): void => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const sourceAccountId = value.length === 0 ? null : Number(value);
    receiptPreparationController.selectSourceAccount(sourceAccountId, optionsState);
  };

  const handleReceiptFileCancel = (event: Event): void => {
    (event.currentTarget as HTMLInputElement).value = '';
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
    receiptPreparationController.refreshOptions(nextState);
  });
  const unsubscribeSaveController = saveController.subscribe((nextState) => {
    saveState = nextState;
  });
  const unsubscribeReceiptCaptureController =
    receiptCaptureController?.subscribe((nextState) => {
      receiptCaptureState = nextState;
      if (nextState.phase === 'error') {
        receiptPreparationController.handleCaptureFailure();
      }
    }) ?? (() => {});
  const unsubscribeReceiptAnalysisController =
    receiptAnalysisController?.subscribe((nextState) => {
      receiptAnalysisState = nextState;
      receiptPreparationController.handleAnalysisState(nextState, optionsState);
    }) ?? (() => {});
  const unsubscribeReceiptPreparationController = receiptPreparationController.subscribe(
    (nextState) => {
      const isNewLocalFailure =
        nextState.phase === 'error' &&
        nextState.error !== null &&
        receiptPreparationState.phase !== 'error';
      receiptPreparationState = nextState;
      if (isNewLocalFailure) {
        receiptCaptureController?.reset();
        receiptAnalysisController?.reset();
      }
    },
  );
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
    if (saveIsBusy) {
      return;
    }

    receiptCaptureController?.cancel();
    receiptPreparationController.reset();
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

  $: if (!canOpenPanel) {
    receiptCaptureController?.cancel();
    receiptPreparationController.reset();
  }

  $: if (
    componentHasMounted &&
    receiptWorkflowIsActive &&
    isOffline &&
    receiptPreparationState.phase !== 'error'
  ) {
    receiptPreparationController.failForOffline();
    receiptCaptureController?.cancel();
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
    unsubscribeReceiptCaptureController();
    unsubscribeReceiptAnalysisController();
    unsubscribeReceiptPreparationController();
    unsubscribeSyncState();
    receiptCaptureController?.cancel();
    receiptPreparationController.reset();
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
      canClose={!saveIsBusy}
      title={$_('addTransfer.title')}
      on:close={handleClose}
    >
      <form
        bind:this={formElement}
        class="add-transfer-form"
        data-testid="add-transfer-form"
        aria-busy={isSubmitting || isOptionsLoading || saveIsBusy || receiptCaptureIsBusy}
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

        <section
          class="add-transfer-form__receipt add-transfer-form__upload"
          aria-labelledby="receipt-capture-heading"
        >
          <div class="add-transfer-form__upload">
            <h4 id="receipt-capture-heading">{$_('addTransfer.receipt.heading')}</h4>
            <p class="add-transfer-form__receipt-hint">
              {$_('addTransfer.receipt.description')}
            </p>
            <p class="add-transfer-form__receipt-hint" data-testid="receipt-semantic-risk">
              {$_('addTransfer.receipt.semanticRisk')}
            </p>
          </div>
          <input
            bind:this={receiptFileInputElement}
            id="receipt-image-capture"
            data-testid="receipt-image-input"
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            disabled={receiptCaptureIsDisabled ||
              (receiptWorkflowIsActive && receiptPreparationState.phase !== 'error')}
            on:change={handleReceiptFileChange}
            on:cancel={handleReceiptFileCancel}
          />
          {#if receiptCaptureController === null}
            <button
              type="button"
              class="app-button app-button--secondary add-transfer-form__action"
              data-testid="receipt-photo-button"
              aria-controls="receipt-image-capture"
              disabled
            >
              <span aria-hidden="true">📷</span>
              {$_('addTransfer.receipt.action')}
            </button>
            <p class="add-transfer-form__receipt-hint" data-testid="receipt-capture-unavailable">
              {$_('addTransfer.receipt.integrationPending')}
            </p>
          {:else if !receiptWorkflowIsActive}
            <button
              type="button"
              class="app-button app-button--secondary add-transfer-form__action"
              data-testid="receipt-photo-button"
              aria-controls="receipt-image-capture"
              disabled={receiptCaptureIsDisabled}
              on:click={openReceiptCapture}
            >
              <span aria-hidden="true">📷</span>
              {$_('addTransfer.receipt.action')}
            </button>
          {:else}
            <ol
              class="receipt-progress"
              aria-label={$_('addTransfer.receipt.progressLabel')}
              aria-live="polite"
              data-testid="receipt-progress"
            >
              {#each receiptPreparationState.steps as step (step.id)}
                <li
                  class={`receipt-progress__step receipt-progress__step--${step.status}`}
                  data-testid={`receipt-step-${step.id}`}
                  data-state={step.status}
                  aria-current={step.status === 'active' ? 'step' : undefined}
                >
                  <span class="receipt-progress__marker" aria-hidden="true"></span>
                  <span>{$_(`addTransfer.receipt.steps.${step.id}`)}</span>
                  <span class="app-visually-hidden"
                    >{$_(`addTransfer.receipt.stepStates.${step.status}`)}</span
                  >
                </li>
              {/each}
            </ol>

            {#if receiptPreparationState.phase === 'error'}
              <button
                type="button"
                class="app-button app-button--secondary add-transfer-form__action"
                data-testid="receipt-photo-button"
                aria-controls="receipt-image-capture"
                disabled={receiptCaptureIsDisabled}
                on:click={openReceiptCapture}
              >
                <span aria-hidden="true">📷</span>
                {$_('addTransfer.receipt.freshAction')}
              </button>
            {:else}
              <div class="add-transfer-form__field receipt-source-account">
                <label class="add-transfer-form__label" for="receipt-source-account">
                  {$_('addTransfer.receipt.sourceAccount')}
                </label>
                <select
                  id="receipt-source-account"
                  class="app-input"
                  data-testid="add-transfer-from-account"
                  value={receiptPreparationState.sourceAccountId ?? ''}
                  disabled={receiptPreparationState.phase === 'ready_for_commit'}
                  on:change={handleReceiptSourceAccountChange}
                >
                  <option value="">{$_('addTransfer.fromAccountPlaceholder')}</option>
                  {#each receiptSourceAccountOptions as account (account.accountId)}
                    <option value={account.accountId}>{getAccountName(account)}</option>
                  {/each}
                </select>
              </div>
              {#if receiptPreparationState.phase === 'waiting_for_source'}
                <p
                  class="add-transfer-form__status"
                  role="status"
                  data-testid="receipt-account-required"
                >
                  {$_('addTransfer.receipt.accountRequired')}
                </p>
              {:else if receiptPreparationState.phase === 'ready_for_commit' && receiptPreparationState.readyForCommit !== null}
                <p
                  class="add-transfer-form__status"
                  role="status"
                  data-testid="receipt-analysis-success"
                >
                  {$_(
                    receiptPreparationState.readyForCommit.length === 1
                      ? 'addTransfer.receipt.analysisSuccessOne'
                      : 'addTransfer.receipt.analysisSuccessMany',
                    { values: { count: receiptPreparationState.readyForCommit.length } },
                  )}
                </p>
              {/if}
            {/if}
          {/if}
        </section>

        {#if !receiptWorkflowIsActive}
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
              disabled={sourceAccountIsDisabled}
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
                <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option
                >
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
                <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option
                >
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
                <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option
                >
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
              disabled={isSubmitting || saveIsBusy}
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
        {:else}
          <div class="add-transfer-form__actions">
            <button
              type="button"
              class="app-button app-button--secondary add-transfer-form__action"
              data-testid="add-transfer-close"
              disabled={isSubmitting || saveIsBusy}
              on:click={handleClose}
            >
              {$_('addTransfer.close')}
            </button>
          </div>
        {/if}
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

  .add-transfer-form__receipt h4,
  .add-transfer-form__receipt p {
    margin: 0;
  }

  .add-transfer-form__receipt-hint {
    color: var(--text-secondary);
    font-size: 0.84rem;
  }

  .receipt-progress {
    display: grid;
    gap: 0.55rem;
    margin: 0.35rem 0;
    padding: 0;
    list-style: none;
  }

  .receipt-progress__step {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 2.75rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--text-secondary) 22%, transparent);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    background: var(--surface-strong);
    font-weight: 650;
  }

  .receipt-progress__marker {
    width: 0.8rem;
    height: 0.8rem;
    flex: 0 0 auto;
    border: 2px solid currentColor;
    border-radius: 999px;
  }

  .receipt-progress__step--active {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-strong));
  }

  .receipt-progress__step--active .receipt-progress__marker {
    background: currentColor;
  }

  .receipt-progress__step--complete {
    color: var(--positive);
  }

  .receipt-progress__step--complete .receipt-progress__marker {
    background: currentColor;
  }

  .receipt-progress__step--error {
    border-color: color-mix(in srgb, var(--error) 50%, transparent);
    color: var(--error);
    background: color-mix(in srgb, var(--error) 8%, var(--surface-strong));
  }

  .receipt-source-account {
    margin-top: 0.2rem;
  }

  .app-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
