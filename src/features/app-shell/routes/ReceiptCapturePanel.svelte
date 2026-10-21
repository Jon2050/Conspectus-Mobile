<!-- Displays receipt capture and progress; the route owns all workflow transitions. -->
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { ReceiptCaptureController, ReceiptTransferPreparationState } from '../../receipt';
  import type { AddTransferAccountOption } from '../../transfers/addTransferFormState';
  import type { AddTransferOptionsState } from '../../transfers/transferOptions';
  import type { ReceiptReviewDraft } from '../../receipt/receiptReviewDraft';
  import ReceiptReviewForm from './ReceiptReviewForm.svelte';
  let {
    receiptFileInputElement = $bindable(null),
    receiptCaptureIsDisabled,
    receiptFileSelectionIsDisabled,
    receiptWorkflowIsActive,
    receiptPreparationState,
    receiptCaptureController,
    displayedReceiptSteps,
    receiptSourceAccountOptions,
    handleReceiptFileChange,
    handleReceiptFileCancel,
    openReceiptCapture,
    handleReceiptSourceAccountChange,
    receiptCategoryOptions,
    reviewIsDisabled,
    sourceIsDisabled,
    handleReceiptDraftChange,
    handleReceiptSave,
  }: {
    receiptFileInputElement?: HTMLInputElement | null;
    receiptCaptureIsDisabled: boolean;
    receiptFileSelectionIsDisabled: boolean;
    receiptWorkflowIsActive: boolean;
    receiptPreparationState: ReceiptTransferPreparationState;
    receiptCaptureController: ReceiptCaptureController | null;
    displayedReceiptSteps: ReceiptTransferPreparationState['steps'];
    receiptSourceAccountOptions: readonly AddTransferAccountOption[];
    handleReceiptFileChange: (event: Event) => void;
    handleReceiptFileCancel: (event: Event) => void;
    openReceiptCapture: () => void;
    handleReceiptSourceAccountChange: (event: Event) => void;
    receiptCategoryOptions: AddTransferOptionsState['categoryOptions'];
    reviewIsDisabled: boolean;
    sourceIsDisabled: boolean;
    handleReceiptDraftChange: (draft: ReceiptReviewDraft) => void;
    handleReceiptSave: () => void;
  } = $props();
</script>

<section
  class="add-transfer-form__receipt add-transfer-form__upload"
  aria-labelledby="receipt-capture-heading"
>
  <details class="receipt-capture-details">
    <summary id="receipt-capture-heading">{$_('addTransfer.receipt.heading')}</summary>
    <p class="add-transfer-form__receipt-hint">{$_('addTransfer.receipt.description')}</p>
    <p class="add-transfer-form__receipt-hint">{$_('addTransfer.receipt.imageGuidance')}</p>
    <p class="add-transfer-form__receipt-hint" data-testid="receipt-semantic-risk">
      {$_('addTransfer.receipt.semanticRisk')}
    </p>
  </details>
  {#if !receiptWorkflowIsActive}
    <p class="add-transfer-form__receipt-hint" data-testid="receipt-duplicate-warning">
      {$_('addTransfer.receipt.duplicateWarning')}
    </p>
  {/if}
  <input
    bind:this={receiptFileInputElement}
    id="receipt-image-capture"
    data-testid="receipt-image-input"
    type="file"
    accept="image/*"
    capture="environment"
    hidden
    disabled={receiptFileSelectionIsDisabled ||
      (receiptWorkflowIsActive &&
        receiptPreparationState.phase !== 'error' &&
        !receiptPreparationState.draft)}
    onchange={handleReceiptFileChange}
    oncancel={handleReceiptFileCancel}
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
      onclick={openReceiptCapture}
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
      {#each displayedReceiptSteps as step (step.id)}
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

    {#if displayedReceiptSteps.some((step) => step.status === 'active')}
      <p class="add-transfer-form__receipt-hint" data-testid="receipt-activity">
        {$_('addTransfer.receipt.processing')}
      </p>
    {/if}

    {#if receiptPreparationState.phase === 'processing' || receiptPreparationState.phase === 'waiting_for_source' || receiptPreparationState.phase === 'reviewing' || receiptPreparationState.phase === 'ready_for_commit'}
      <div class="add-transfer-form__field receipt-source-account">
        <label class="add-transfer-form__label" for="receipt-source-account">
          {$_('addTransfer.receipt.sourceAccount')}
        </label>
        <select
          id="receipt-source-account"
          class="app-input"
          data-testid="add-transfer-from-account"
          value={receiptPreparationState.sourceAccountId ?? ''}
          disabled={receiptPreparationState.phase === 'ready_for_commit' || sourceIsDisabled}
          onchange={handleReceiptSourceAccountChange}
        >
          <option value="">{$_('addTransfer.fromAccountPlaceholder')}</option>
          {#each receiptSourceAccountOptions as account (account.accountId)}
            <option value={account.accountId}>{account.name}</option>
          {/each}
        </select>
      </div>
      {#if receiptPreparationState.phase === 'waiting_for_source'}
        <p class="add-transfer-form__status" role="status" data-testid="receipt-account-required">
          {$_('addTransfer.receipt.accountRequired')}
        </p>
      {:else if receiptPreparationState.phase === 'ready_for_commit' && receiptPreparationState.readyForCommit !== null}
        <p class="add-transfer-form__status" role="status" data-testid="receipt-analysis-success">
          {$_(
            receiptPreparationState.readyForCommit.length === 1
              ? 'addTransfer.receipt.analysisSuccessOne'
              : 'addTransfer.receipt.analysisSuccessMany',
            { values: { count: receiptPreparationState.readyForCommit.length } },
          )}
        </p>
      {/if}
      {#if receiptPreparationState.draft}
        <ReceiptReviewForm
          draft={receiptPreparationState.draft}
          categories={receiptCategoryOptions}
          disabled={reviewIsDisabled || receiptPreparationState.phase === 'ready_for_commit'}
          onChange={handleReceiptDraftChange}
          onSave={handleReceiptSave}
        />
      {/if}
    {/if}
  {/if}
</section>
