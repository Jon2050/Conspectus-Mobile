<!-- Manual input presentation; validation and persistence remain owned by AddRoute. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { PRIMARY_INCOME_ACCOUNT_TYPE_ID, PRIMARY_SPENDINGS_ACCOUNT_TYPE_ID } from '@db';
  import { NO_CATEGORY_SELECTED, type AddTransferFormFields } from './addTransferFormState';
  import type { AddTransferOptionsState } from './addTransferOptionsController';
  import {
    appendAmountInputDigit,
    formatAmountInputValue,
    removeLastAmountInputDigit,
  } from './addTransferAmountInput';
  let {
    fields = $bindable(),
    optionsState,
    controlsAreDisabled,
    sourceAccountIsDisabled,
    clearValidation,
  }: {
    fields: AddTransferFormFields;
    optionsState: AddTransferOptionsState;
    controlsAreDisabled: boolean;
    sourceAccountIsDisabled: boolean;
    clearValidation: () => void;
  } = $props();
  let amountInputElement = $state<HTMLInputElement | null>(null);
  const allowedAmountNavigationKeys = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

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
</script>

<div class="add-transfer-form__field">
  <label class="add-transfer-form__label" for="add-transfer-date">{$_('addTransfer.date')}</label>
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
  <label class="add-transfer-form__label" for="add-transfer-name">{$_('addTransfer.name')}</label>
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
    onkeydown={handleAmountKeydown}
    oninput={handleAmountInput}
    onpaste={handleAmountPaste}
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
    {#each ['category1Id', 'category2Id', 'category3Id'] as field, index (field)}
      <select
        id={`add-transfer-category-${index + 1}`}
        class="app-input"
        data-testid={`add-transfer-category-${index + 1}`}
        bind:value={fields[field as 'category1Id' | 'category2Id' | 'category3Id']}
        disabled={controlsAreDisabled}
      >
        <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
        {#each optionsState.categoryOptions as cat (cat.categoryId)}
          <option value={cat.categoryId}>{cat.name}</option>
        {/each}
      </select>
    {/each}
  </div>
</div>
