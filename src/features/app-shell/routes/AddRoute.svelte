<!-- Renders manual Add Transfer entry and the transient staged receipt-preparation workflow. -->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import {
    appAccountQueryService,
    appCategoryQueryService,
    PRIMARY_INCOME_ACCOUNT_TYPE_ID,
    PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
    type CreateTransferInput,
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
    validateReceiptSetup,
    DEFAULT_TRANSFER_DERIVATION_RULES,
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
  import { presentOperationFailure } from '../failurePresentation';
  import BottomSheet from '../components/BottomSheet.svelte';
  import ManualTransferForm from './ManualTransferForm.svelte';
  import ReceiptCapturePanel from './ReceiptCapturePanel.svelte';
  import type { ReceiptReviewDraft } from '../../receipt/receiptReviewDraft';
  import TransferCommitStatus from './TransferCommitStatus.svelte';
  import './addTransfer.css';
  import {
    createReceiptTransferCommitController,
    type ReceiptTransferCommitContext,
    type ReceiptTransferCommitController,
    type ReceiptTransferCommitState,
  } from '../receiptTransferCommitController';
  import {
    createInitialFormFields,
    type AddTransferFormFields,
  } from '../../transfers/addTransferFormState';
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
  export let canCreateTransfer = true;
  export let resolveReceiptRules: () => string | null = () => null;
  export let receiptCaptureController: ReceiptCaptureController | null = null;
  export let receiptAnalysisController: ReceiptAnalysisController | null = null;
  export let receiptPreparationController: ReceiptTransferPreparationController =
    createReceiptTransferPreparationController();
  export let receiptCommitController: ReceiptTransferCommitController =
    createReceiptTransferCommitController();
  export let resolveReceiptCommitIdentity: () => {
    readonly isAuthenticated: boolean;
    readonly isVerifiedCurrent: boolean;
    readonly contextKey: string | null;
  } = () => ({ isAuthenticated: false, isVerifiedCurrent: false, contextKey: null });

  let isOpen = true;
  let componentHasMounted = false;
  let hasRequestedOptionsLoad = false;
  let formElement: HTMLFormElement | null = null;
  let receiptFileInputElement: HTMLInputElement | null = null;
  let receiptSetupError: ReceiptTransferPreparationError | null = null;
  let receiptSummary: readonly CreateTransferInput[] = [];
  let optionsState: AddTransferOptionsState = controller.getState();
  let defaultAccountsApplied = false;
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
  let receiptCommitState: ReceiptTransferCommitState = receiptCommitController.getState();
  let lastObservedSyncState: SyncState = 'idle';
  $: isOffline = !$networkStateStore;
  $: isOptionsLoading = optionsState.operation === 'loading';
  $: saveIsBusy =
    saveState.phase === 'local_save' ||
    saveState.phase === 'uploading' ||
    saveState.phase === 'conflict_syncing' ||
    saveState.phase === 'remote_commit_syncing' ||
    saveState.phase === 'local_commit_syncing';
  $: conflictRecoveryIsRequired =
    saveState.phase === 'conflict' || saveState.phase === 'conflict_syncing';
  $: remoteCommitRecoveryIsRequired =
    saveState.phase === 'remote_commit_syncing' ||
    saveState.phase === 'remote_commit_recovered' ||
    saveState.phase === 'remote_commit_recovery_failed';
  $: saveBlocksEditing =
    saveState.canRetry ||
    conflictRecoveryIsRequired ||
    remoteCommitRecoveryIsRequired ||
    saveState.phase === 'local_commit_syncing' ||
    saveState.phase === 'local_commit_recovery_failed' ||
    saveState.phase === 'invalidated';
  $: receiptCaptureIsBusy =
    receiptCaptureState.phase === 'normalizing' ||
    (receiptCaptureState.phase === 'handed_off' && !receiptPreparationState.draft) ||
    receiptAnalysisState.phase === 'extracting' ||
    receiptAnalysisState.phase === 'deriving';
  $: receiptWorkflowIsActive =
    receiptPreparationState.phase !== 'idle' || receiptCommitState.phase !== 'idle';
  $: receiptCommitIsBusy = [
    'validating',
    'local_save',
    'uploading',
    'local_commit_syncing',
    'conflict_syncing',
    'remote_commit_syncing',
  ].includes(receiptCommitState.phase);
  $: displayedReceiptSteps =
    receiptPreparationState.phase !== 'idle'
      ? receiptPreparationState.steps
      : [
          { id: 'extraction' as const, status: 'complete' as const },
          { id: 'derivation' as const, status: 'complete' as const },
          {
            id: 'creation' as const,
            status:
              receiptCommitState.phase === 'saved'
                ? ('complete' as const)
                : receiptCommitIsBusy
                  ? ('active' as const)
                  : ('error' as const),
          },
        ];
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
  $: receiptCommitError =
    receiptCommitState.error === null
      ? null
      : receiptCommitState.error.preparationError !== null
        ? translateReceiptPreparationError(receiptCommitState.error.preparationError)
        : $_(`addTransfer.receipt.commit.errors.${receiptCommitState.error.code}`);
  $: receiptAnalysisMessage =
    receiptAnalysisState.errorCode === null
      ? null
      : $_(
          `addTransfer.receipt.analysisErrors.${receiptAnalysisState.errorCode === 'model_unavailable' && receiptAnalysisState.stage !== null ? `model_unavailable_${receiptAnalysisState.stage}` : receiptAnalysisState.errorCode}`,
        );
  $: receiptAnalysisError =
    receiptAnalysisState.phase !== 'error'
      ? null
      : receiptAnalysisState.errorReason === null
        ? receiptAnalysisMessage
        : `${receiptAnalysisMessage} ${receiptAnalysisState.errorReason}`;
  $: receiptCaptureError =
    translateReceiptPreparationError(receiptSetupError) ??
    receiptCommitError ??
    receiptPreparationError ??
    receiptAnalysisError ??
    (receiptCaptureState.errorCode === null
      ? null
      : $_(`addTransfer.receipt.errors.${receiptCaptureState.errorCode}`));
  $: effectiveFormError =
    formError ??
    receiptCaptureError ??
    (conflictRecoveryIsRequired ? null : saveState.errorMessage) ??
    (optionsState.error === null
      ? null
      : $_(presentOperationFailure(optionsState.error.cause).messageKey)) ??
    null;
  $: controlsAreDisabled =
    isSubmitting ||
    isOptionsLoading ||
    saveIsBusy ||
    receiptCommitIsBusy ||
    saveBlocksEditing ||
    receiptCaptureIsBusy;
  $: sourceAccountIsDisabled = isSubmitting || isOptionsLoading || saveIsBusy || saveBlocksEditing;
  $: submitIsDisabled =
    !canCreateTransfer || controlsAreDisabled || isOffline || optionsState.operation !== 'ready';
  // A native picker can return while an unchanged foreground check temporarily revokes writes.
  // Accept its image under the still-open context; the commit remains gated by current verification.
  $: receiptFileSelectionIsDisabled =
    !canOpenPanel ||
    receiptCaptureController === null ||
    controlsAreDisabled ||
    isOffline ||
    optionsState.operation !== 'ready';
  $: receiptCaptureIsDisabled = !canCreateTransfer || receiptFileSelectionIsDisabled;

  let validationErrors: string[] = [];
  const clearValidation = (): void => {
    if (validationErrors.length > 0) {
      validationErrors = [];
    }
  };

  const resetSuccessfulSave = (): void => {
    if (saveController.getState().phase === 'saved') {
      fields = createInitialFormFields();
      defaultAccountsApplied = false;
      applyDefaultAccounts();
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

  const handleSubmit = async (): Promise<void> => {
    if (receiptWorkflowIsActive) {
      await handleReceiptSave();
      return;
    }
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

  const checkReceiptSetup = (): boolean => {
    receiptSetupError = validateReceiptSetup(
      optionsState,
      resolveReceiptRules() === DEFAULT_TRANSFER_DERIVATION_RULES.text,
    );
    return receiptSetupError === null;
  };

  const openReceiptCapture = (): void => {
    if (!receiptCaptureIsDisabled && checkReceiptSetup()) {
      receiptFileInputElement?.click();
    }
  };

  const handleReceiptFileChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (
      file === null ||
      receiptCaptureController === null ||
      receiptFileSelectionIsDisabled ||
      !checkReceiptSetup()
    ) {
      return;
    }

    clearValidation();
    receiptSummary = [];
    receiptCommitController.reset();
    receiptPreparationController.beginRun();
    void receiptCaptureController.capture(file);
  };

  const handleReceiptSourceAccountChange = (event: Event): void => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const sourceAccountId = value.length === 0 ? null : Number(value);
    receiptPreparationController.selectSourceAccount(sourceAccountId, optionsState);
  };

  const handleReceiptDraftChange = (draft: ReceiptReviewDraft): void => {
    receiptPreparationController.updateDraft(draft);
  };

  const handleReceiptSave = async (): Promise<void> => {
    if (submitIsDisabled || receiptCaptureIsBusy || receiptCommitState.phase !== 'idle') return;
    receiptPreparationController.prepareForSave(optionsState);
    const commands = receiptPreparationController.claimReadyForCommit();
    if (commands === null) return;
    receiptSummary = commands;
    receiptCaptureController?.reset();
    receiptAnalysisController?.reset();
    await receiptCommitController.commit(commands, createReceiptCommitContext(), $_);
  };

  const handleReceiptFileCancel = (event: Event): void => {
    (event.currentTarget as HTMLInputElement).value = '';
  };

  const createReceiptCommitContext = (): ReceiptTransferCommitContext => {
    const identity = resolveReceiptCommitIdentity();
    return {
      isOnline: get(networkStateStore),
      isAuthenticated: identity.isAuthenticated,
      isVerifiedCurrent: identity.isVerifiedCurrent,
      contextKey: identity.contextKey,
      optionsState,
    };
  };

  const retryReceiptUpload = async (): Promise<void> => {
    receiptPreparationController.markCommitActive();
    await receiptCommitController.retryUpload(createReceiptCommitContext(), $_);
  };

  const resolveReceiptConflict = async (): Promise<void> => {
    receiptPreparationController.markCommitActive();
    await receiptCommitController.resolveConflict(async () => {
      await controller.load();
      return createReceiptCommitContext();
    }, $_);
  };

  const retryReceiptAfterConflict = async (): Promise<void> => {
    receiptPreparationController.markCommitActive();
    await receiptCommitController.retryAfterConflict(createReceiptCommitContext(), $_);
  };

  const retryReceiptLocalCommitRecovery = async (): Promise<void> => {
    receiptPreparationController.markCommitActive();
    await receiptCommitController.retryLocalCommitRecovery($_);
  };

  const applyDefaultAccounts = (): void => {
    if (optionsState.operation !== 'ready' || defaultAccountsApplied) return;
    defaultAccountsApplied = true;
    fields = {
      ...fields,
      fromAccountId:
        fields.fromAccountId ??
        optionsState.fromAccountOptions.find(
          (account) => account.accountTypeId === PRIMARY_INCOME_ACCOUNT_TYPE_ID,
        )?.accountId ??
        null,
      toAccountId:
        fields.toAccountId ??
        optionsState.toAccountOptions.find(
          (account) => account.accountTypeId === PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID,
        )?.accountId ??
        null,
    };
  };

  const unsubscribeController = controller.subscribe((nextState) => {
    optionsState = nextState;
    applyDefaultAccounts();
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
  const unsubscribeReceiptCommitController = receiptCommitController.subscribe((nextState) => {
    receiptCommitState = nextState;
    if (nextState.phase === 'saved') {
      receiptPreparationController.markCommitted();
      receiptCaptureController?.reset();
      receiptAnalysisController?.reset();
    } else if (
      [
        'upload_failed',
        'local_commit_recovery_failed',
        'conflict',
        'conflict_ready',
        'remote_commit_recovery_failed',
        'failed',
        'invalidated',
      ].includes(nextState.phase)
    ) {
      receiptPreparationController.markCommitFailed();
      receiptCaptureController?.reset();
      receiptAnalysisController?.reset();
    } else if (
      [
        'validating',
        'local_save',
        'uploading',
        'local_commit_syncing',
        'conflict_syncing',
        'remote_commit_syncing',
      ].includes(nextState.phase)
    ) {
      receiptPreparationController.markCommitActive();
    }
  });
  const unsubscribeSyncState = syncStateStore.subscribe((syncSnapshot) => {
    if (syncSnapshot.state === lastObservedSyncState) {
      return;
    }

    lastObservedSyncState = syncSnapshot.state;
    if (
      shouldReloadAddTransferOptionsForSyncState(syncSnapshot.state) &&
      !(syncSnapshot.branch === 'online_unchanged' && optionsState.operation === 'ready')
    ) {
      void controller.load();
    }
  });

  const handleClose = (): void => {
    if (isSubmitting || saveIsBusy || receiptCommitIsBusy) {
      return;
    }

    receiptCaptureController?.cancel();
    receiptPreparationController.reset();
    if (receiptCommitController.getState().phase === 'saved') {
      receiptCommitController.reset();
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

  $: if (!canOpenPanel) {
    receiptCaptureController?.cancel();
    receiptPreparationController.reset();
  }

  $: if (
    componentHasMounted &&
    receiptWorkflowIsActive &&
    isOffline &&
    receiptPreparationState.error?.code !== 'offline' &&
    ['processing', 'waiting_for_source', 'reviewing', 'ready_for_commit'].includes(
      receiptPreparationState.phase,
    )
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
    unsubscribeReceiptCommitController();
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
      showCloseButton={false}
      canClose={!isSubmitting && !saveIsBusy && !receiptCommitIsBusy}
      closeLabel={$_('addTransfer.close')}
      title={$_('addTransfer.title')}
      onClose={handleClose}
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
        <TransferCommitStatus
          {receiptCommitState}
          {isOptionsLoading}
          {effectiveFormError}
          {isOffline}
          {saveState}
          {remoteCommitRecoveryIsRequired}
          {validationErrors}
          {receiptSummary}
          {optionsState}
          {retryReceiptUpload}
          {resolveReceiptConflict}
          {retryReceiptAfterConflict}
          {retryReceiptLocalCommitRecovery}
        />

        <ReceiptCapturePanel
          bind:receiptFileInputElement
          {receiptCaptureIsDisabled}
          {receiptFileSelectionIsDisabled}
          {receiptWorkflowIsActive}
          {receiptPreparationState}
          {receiptCaptureController}
          {displayedReceiptSteps}
          {receiptSourceAccountOptions}
          {handleReceiptFileChange}
          {handleReceiptFileCancel}
          {openReceiptCapture}
          {handleReceiptSourceAccountChange}
          receiptCategoryOptions={optionsState.categoryOptions}
          reviewIsDisabled={submitIsDisabled || receiptCaptureIsBusy}
          sourceIsDisabled={sourceAccountIsDisabled || receiptCommitIsBusy || isOffline}
          {handleReceiptDraftChange}
          {handleReceiptSave}
        />

        {#if !receiptWorkflowIsActive}
          <ManualTransferForm
            bind:fields
            {optionsState}
            {controlsAreDisabled}
            {sourceAccountIsDisabled}
            {clearValidation}
          />

          <div class="add-transfer-form__actions">
            <button
              type="button"
              class="app-button app-button--secondary add-transfer-form__action"
              data-testid="add-transfer-close"
              disabled={isSubmitting || saveIsBusy || receiptCommitIsBusy}
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
            {:else if saveState.phase === 'conflict' || saveState.phase === 'conflict_syncing' || saveState.phase === 'local_commit_recovery_failed'}
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
              disabled={isSubmitting || saveIsBusy || receiptCommitIsBusy}
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
