<!-- Renders the Add Transfer bottom-sheet form with all MVP fields for mobile data entry. -->
<script lang="ts">
  import { _ } from 'svelte-i18n';
  import BottomSheet from '../components/BottomSheet.svelte';
  import {
    createInitialFormFields,
    NO_CATEGORY_SELECTED,
    type AddTransferAccountOption,
    type AddTransferCategoryOption,
    type AddTransferFormFields,
  } from './addTransferFormState';

  export let fromAccountOptions: readonly AddTransferAccountOption[] = [];
  export let toAccountOptions: readonly AddTransferAccountOption[] = [];
  export let categoryOptions: readonly AddTransferCategoryOption[] = [];
  export let fields: AddTransferFormFields = createInitialFormFields();
  export let isSubmitting = false;
  export let formError: string | null = null;

  let isOpen = true;

  const navIconBaseUrl = import.meta.env.BASE_URL;
  const categoryIconUrl = `${navIconBaseUrl}icons/category_55.png`;

  const handleClose = (): void => {
    isOpen = false;
    if (typeof window !== 'undefined') {
      window.location.hash = '#/transfers';
    }
  };

  const handleReopen = (): void => {
    fields = createInitialFormFields();
    isOpen = true;
  };
</script>

<section class="add-route" data-testid="route-add">
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

  <BottomSheet {isOpen} title={$_('addTransfer.title')} on:close={handleClose}>
    <form
      class="add-transfer-form"
      data-testid="add-transfer-form"
      aria-busy={isSubmitting}
      on:submit|preventDefault
    >
      {#if formError !== null}
        <p class="add-transfer-form__error" role="alert" data-testid="add-transfer-form-error">
          {formError}
        </p>
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
          disabled={isSubmitting}
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
          disabled={isSubmitting}
          autocomplete="off"
        />
      </div>

      <div class="add-transfer-form__field">
        <label class="add-transfer-form__label" for="add-transfer-amount"
          >{$_('addTransfer.amount')}</label
        >
        <input
          id="add-transfer-amount"
          type="text"
          inputmode="decimal"
          class="app-input"
          data-testid="add-transfer-amount"
          placeholder={$_('addTransfer.amountPlaceholder')}
          bind:value={fields.amount}
          disabled={isSubmitting}
          autocomplete="off"
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
          disabled={isSubmitting}
        >
          <option value={null}>{$_('addTransfer.fromAccountPlaceholder')}</option>
          {#each fromAccountOptions as account (account.accountId)}
            <option value={account.accountId}>{account.name}</option>
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
          disabled={isSubmitting}
        >
          <option value={null}>{$_('addTransfer.toAccountPlaceholder')}</option>
          {#each toAccountOptions as account (account.accountId)}
            <option value={account.accountId}>{account.name}</option>
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
            disabled={isSubmitting}
          >
            <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
            {#each categoryOptions as cat (cat.categoryId)}
              <option value={cat.categoryId}>{cat.name}</option>
            {/each}
          </select>
          <select
            id="add-transfer-category-2"
            class="app-input"
            data-testid="add-transfer-category-2"
            bind:value={fields.category2Id}
            disabled={isSubmitting}
          >
            <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
            {#each categoryOptions as cat (cat.categoryId)}
              <option value={cat.categoryId}>{cat.name}</option>
            {/each}
          </select>
          <select
            id="add-transfer-category-3"
            class="app-input"
            data-testid="add-transfer-category-3"
            bind:value={fields.category3Id}
            disabled={isSubmitting}
          >
            <option value={NO_CATEGORY_SELECTED}>{$_('addTransfer.categoryPlaceholder')}</option>
            {#each categoryOptions as cat (cat.categoryId)}
              <option value={cat.categoryId}>{cat.name}</option>
            {/each}
          </select>
        </div>
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
          disabled={isSubmitting}
          autocomplete="off"
        />
      </div>

      <div class="add-transfer-form__actions">
        <button
          type="button"
          class="app-button app-button--secondary add-transfer-form__action"
          data-testid="add-transfer-close"
          disabled={isSubmitting}
          on:click={handleClose}
        >
          {$_('addTransfer.close')}
        </button>
        <button
          type="submit"
          class="app-button app-button--primary add-transfer-form__action"
          data-testid="add-transfer-submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? $_('addTransfer.saving') : $_('addTransfer.submit')}
        </button>
      </div>
    </form>
  </BottomSheet>
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
    gap: 1rem;
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

  .add-transfer-form__field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
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
    gap: 0.4rem;
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
