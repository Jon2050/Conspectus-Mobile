<!-- A reviewed receipt is an editable manual batch; persistence starts only on Save. -->
<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { formatAmountDisplay } from '@shared';
  import { formatAmountInputValue } from '../../transfers/addTransferAmountInput';
  import type { AddTransferOptionsState } from '../../transfers/transferOptions';
  import {
    receiptReviewTotalCents,
    type ReceiptReviewDraft,
    type ReceiptReviewTransfer,
  } from '../../receipt/receiptReviewDraft';

  let {
    draft,
    categories,
    disabled,
    onChange,
    onSave,
  }: {
    draft: ReceiptReviewDraft;
    categories: AddTransferOptionsState['categoryOptions'];
    disabled: boolean;
    onChange: (draft: ReceiptReviewDraft) => void;
    onSave: () => void;
  } = $props();
  const updateRow = (id: number, patch: Partial<ReceiptReviewTransfer>) =>
    onChange({
      ...draft,
      transfers: draft.transfers.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  const updateCategory = (row: ReceiptReviewTransfer, index: number, name: string) => {
    const names = [...row.categoryNames];
    names[index] = name;
    updateRow(row.id, { categoryNames: names.filter(Boolean) });
  };
  const addRow = () =>
    onChange({
      ...draft,
      transfers: [
        ...draft.transfers,
        {
          id: Math.max(-1, ...draft.transfers.map((row) => row.id)) + 1,
          name: '',
          amount: '',
          categoryNames: [],
        },
      ],
    });
  const total = $derived(receiptReviewTotalCents(draft));
  const money = (amount: number) =>
    formatAmountDisplay(amount, amount < 0 ? 'negative' : 'neutral', $locale ?? 'de');
</script>

<div class="receipt-review" data-testid="receipt-review">
  <p class="add-transfer-form__receipt-hint">{$_('addTransfer.receipt.review.hint')}</p>
  <div class="add-transfer-form__field">
    <label class="add-transfer-form__label" for="receipt-review-date"
      >{$_('addTransfer.date')}</label
    >
    <input
      id="receipt-review-date"
      data-testid="receipt-review-date"
      class="app-input"
      type="date"
      value={draft.date}
      {disabled}
      oninput={(event) => onChange({ ...draft, date: event.currentTarget.value })}
    />
  </div>
  <div class="add-transfer-form__field">
    <label class="add-transfer-form__label" for="receipt-review-buyplace"
      >{$_('addTransfer.buyplace')}</label
    >
    <input
      id="receipt-review-buyplace"
      data-testid="receipt-review-buyplace"
      class="app-input"
      type="text"
      maxlength="200"
      value={draft.buyplace}
      {disabled}
      oninput={(event) => onChange({ ...draft, buyplace: event.currentTarget.value })}
    />
  </div>
  {#each draft.transfers as row, index (row.id)}
    <fieldset
      class="receipt-review__transfer"
      data-testid={`receipt-review-transfer-${row.id}`}
      {disabled}
    >
      <legend>{$_('addTransfer.receipt.review.transfer', { values: { number: index + 1 } })}</legend
      >
      <div class="add-transfer-form__field">
        <label class="add-transfer-form__label" for={`receipt-review-name-${row.id}`}
          >{$_('addTransfer.name')}</label
        >
        <input
          id={`receipt-review-name-${row.id}`}
          data-testid={`receipt-review-name-${row.id}`}
          class="app-input"
          type="text"
          maxlength="200"
          value={row.name}
          oninput={(event) => updateRow(row.id, { name: event.currentTarget.value })}
        />
      </div>
      {#each [0, 1, 2] as categoryIndex (categoryIndex)}
        <div class="add-transfer-form__field">
          <label
            class="add-transfer-form__label"
            for={`receipt-review-category-${row.id}-${categoryIndex}`}
            >{$_('addTransfer.receipt.review.category', {
              values: { number: categoryIndex + 1 },
            })}</label
          >
          <select
            id={`receipt-review-category-${row.id}-${categoryIndex}`}
            data-testid={`receipt-review-category-${row.id}-${categoryIndex}`}
            class="app-input"
            value={row.categoryNames[categoryIndex] ?? ''}
            onchange={(event) => updateCategory(row, categoryIndex, event.currentTarget.value)}
          >
            <option value="">{$_('addTransfer.receipt.review.noCategory')}</option>
            {#if row.categoryNames[categoryIndex] && !categories.some((category) => category.name === row.categoryNames[categoryIndex])}
              <option value={row.categoryNames[categoryIndex]}
                >{row.categoryNames[categoryIndex]} ({$_(
                  'addTransfer.receipt.review.unknownCategory',
                )})</option
              >
            {/if}
            {#each categories as category (category.categoryId)}<option value={category.name}
                >{category.name}</option
              >{/each}
          </select>
        </div>
      {/each}
      <div class="add-transfer-form__field">
        <label class="add-transfer-form__label" for={`receipt-review-amount-${row.id}`}
          >{$_('addTransfer.amount')}</label
        >
        <input
          id={`receipt-review-amount-${row.id}`}
          data-testid={`receipt-review-amount-${row.id}`}
          class="app-input"
          type="text"
          inputmode="decimal"
          value={row.amount}
          oninput={(event) =>
            updateRow(row.id, { amount: formatAmountInputValue(event.currentTarget.value) })}
        />
      </div>
      <button
        type="button"
        class="app-button app-button--secondary"
        data-testid={`receipt-review-remove-${row.id}`}
        disabled={draft.transfers.length === 1}
        onclick={() =>
          onChange({ ...draft, transfers: draft.transfers.filter((item) => item.id !== row.id) })}
        >{$_('addTransfer.receipt.review.remove')}</button
      >
    </fieldset>
  {/each}
  <button
    type="button"
    class="app-button app-button--secondary"
    data-testid="receipt-review-add"
    disabled={disabled || draft.transfers.length >= 100}
    onclick={addRow}>{$_('addTransfer.receipt.review.add')}</button
  >
  <div class="receipt-review__total" data-testid="receipt-review-total">
    <span>{$_('addTransfer.receipt.review.total')}</span><strong
      >{total === null ? '—' : money(total)}</strong
    >
  </div>
  {#if draft.receiptTotalCents !== null}
    <p class="add-transfer-form__receipt-hint" data-testid="receipt-review-original-total">
      {$_('addTransfer.receipt.review.receiptTotal')}: {money(draft.receiptTotalCents)}
    </p>
    {#if total !== null && total !== draft.receiptTotalCents}
      <p
        class="add-transfer-form__receipt-hint"
        role="status"
        data-testid="receipt-review-total-difference"
      >
        {$_('addTransfer.receipt.review.totalDifference')}
      </p>
    {/if}
  {/if}
  <button
    type="button"
    class="app-button app-button--primary"
    data-testid="receipt-review-save"
    {disabled}
    onclick={onSave}>{$_('addTransfer.receipt.review.save')}</button
  >
</div>

<style>
  .receipt-review {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .receipt-review__transfer {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    margin: 0;
    padding: 1rem;
    border: 1px solid var(--color-border, #d5d9df);
    border-radius: 0.75rem;
  }
  .receipt-review__total {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
</style>
