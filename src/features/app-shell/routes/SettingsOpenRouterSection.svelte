<!-- Renders key-safe OpenRouter model and derivation-prompt settings for the active account. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';

  import type {
    SettingsOpenRouterController,
    SettingsOpenRouterState,
  } from './settingsOpenRouterController';

  export let controller: SettingsOpenRouterController;

  let state: SettingsOpenRouterState = controller.getState();
  let apiKeyCandidate = '';

  const unsubscribe = controller.subscribe((nextState) => {
    state = nextState;
  });

  const handleApiKeySubmit = async (): Promise<void> => {
    const wasSaved = await controller.validateAndSaveApiKey(apiKeyCandidate);
    if (wasSaved) {
      apiKeyCandidate = '';
    }
  };

  const handleVisionModelChange = (event: Event): void => {
    controller.selectVisionModel((event.currentTarget as HTMLSelectElement).value);
  };

  const handleTransferModelChange = (event: Event): void => {
    controller.selectTransferModel((event.currentTarget as HTMLSelectElement).value);
  };

  const handleTransferPromptInput = (event: Event): void => {
    controller.setTransferPrompt((event.currentTarget as HTMLTextAreaElement).value);
  };

  const catalogErrorTranslationKey = (
    catalogStatus: SettingsOpenRouterState['catalogStatus'],
  ): string | null => {
    const translationKeys: Partial<Record<SettingsOpenRouterState['catalogStatus'], string>> = {
      invalid_key: 'settings.openRouter.status.invalidKey',
      network_error: 'settings.openRouter.status.networkError',
      provider_error: 'settings.openRouter.status.providerError',
      invalid_response: 'settings.openRouter.status.invalidResponse',
      storage_error: 'settings.openRouter.status.storageError',
    };
    return translationKeys[catalogStatus] ?? null;
  };

  $: catalogErrorKey = catalogErrorTranslationKey(state.catalogStatus);
  $: retryIsAvailable =
    state.catalogStatus === 'network_error' ||
    state.catalogStatus === 'provider_error' ||
    state.catalogStatus === 'invalid_response' ||
    state.catalogStatus === 'storage_error';

  onDestroy(unsubscribe);
</script>

<section
  class="openrouter-settings"
  data-testid="openrouter-settings"
  aria-labelledby="openrouter-settings-heading"
  aria-busy={state.catalogStatus === 'loading'}
>
  <header class="openrouter-settings__header">
    <h3 id="openrouter-settings-heading">{$_('settings.openRouter.heading')}</h3>
    <p>{$_('settings.openRouter.description')}</p>
  </header>

  <aside class="openrouter-settings__privacy" data-testid="openrouter-privacy-disclosure">
    <h4>{$_('settings.openRouter.privacy.heading')}</h4>
    <p>{$_('settings.openRouter.privacy.localKey')}</p>
    <p>{$_('settings.openRouter.privacy.stageOne')}</p>
    <p>{$_('settings.openRouter.privacy.stageTwo')}</p>
    <p>{$_('settings.openRouter.privacy.providerPolicies')}</p>
    <p>{$_('settings.openRouter.privacy.routing')}</p>
    <p>{$_('settings.openRouter.privacy.catalogOnly')}</p>
  </aside>

  {#if state.hasStoredApiKey}
    <div class="openrouter-settings__configured-key" data-testid="openrouter-key-configured">
      <span>{$_('settings.openRouter.key.configured')}</span>
      <span aria-hidden="true">••••••••</span>
    </div>
  {/if}

  <form
    class="openrouter-settings__key-form"
    on:submit|preventDefault={() => void handleApiKeySubmit()}
  >
    <label for="openrouter-api-key">
      {state.hasStoredApiKey
        ? $_('settings.openRouter.key.replaceLabel')
        : $_('settings.openRouter.key.label')}
    </label>
    <input
      id="openrouter-api-key"
      class="app-input"
      data-testid="openrouter-api-key-input"
      type="password"
      autocomplete="new-password"
      autocapitalize="none"
      spellcheck="false"
      bind:value={apiKeyCandidate}
      placeholder={$_('settings.openRouter.key.placeholder')}
      disabled={state.catalogStatus === 'loading'}
      aria-describedby="openrouter-key-help"
    />
    <p id="openrouter-key-help" class="openrouter-settings__help">
      {$_('settings.openRouter.key.help')}
    </p>
    <div class="openrouter-settings__actions">
      <button
        class="app-button app-button--primary"
        type="submit"
        data-testid="openrouter-save-key-button"
        disabled={state.catalogStatus === 'loading' || !apiKeyCandidate.trim()}
      >
        {state.catalogStatus === 'loading'
          ? $_('settings.openRouter.key.validating')
          : state.hasStoredApiKey
            ? $_('settings.openRouter.key.replace')
            : $_('settings.openRouter.key.save')}
      </button>
      {#if state.hasStoredApiKey}
        <button
          class="app-button app-button--danger"
          type="button"
          data-testid="openrouter-delete-key-button"
          disabled={state.catalogStatus === 'loading'}
          on:click={() => controller.deleteConfiguration()}
        >
          {$_('settings.openRouter.key.delete')}
        </button>
      {/if}
    </div>
  </form>

  {#if state.actionError === 'key_required'}
    <p class="openrouter-settings__error" role="alert">
      {$_('settings.openRouter.status.keyRequired')}
    </p>
  {:else if state.actionError === 'storage_error'}
    <p class="openrouter-settings__error" role="alert">
      {$_('settings.openRouter.status.storageError')}
    </p>
  {/if}

  {#if state.catalogStatus === 'loading'}
    <p class="openrouter-settings__status" role="status" aria-live="polite">
      {$_('settings.openRouter.status.loading')}
    </p>
  {:else if catalogErrorKey !== null}
    <div class="openrouter-settings__error" role="alert">
      <p>{$_(catalogErrorKey)}</p>
      {#if retryIsAvailable}
        <button
          class="app-button app-button--secondary"
          type="button"
          data-testid="openrouter-retry-catalog-button"
          on:click={() => void controller.retryCatalog()}
        >
          {$_('settings.openRouter.status.retry')}
        </button>
      {/if}
    </div>
  {:else if state.catalogStatus === 'ready'}
    <p class="openrouter-settings__status" role="status" aria-live="polite">
      {$_('settings.openRouter.status.validated')}
    </p>
  {:else}
    <p class="openrouter-settings__status" role="status">
      {$_('settings.openRouter.status.keyNeeded')}
    </p>
  {/if}

  <div class="openrouter-settings__field">
    <label for="openrouter-vision-model">{$_('settings.openRouter.models.visionLabel')}</label>
    <select
      id="openrouter-vision-model"
      class="app-input"
      data-testid="openrouter-vision-model"
      value={state.selectedVisionModelId ?? ''}
      disabled={state.catalogStatus !== 'ready' || state.visionModels.length === 0}
      on:change={handleVisionModelChange}
    >
      <option value="">{$_('settings.openRouter.models.placeholder')}</option>
      {#each state.visionModels as model (model.id)}
        <option value={model.id}>{model.label}</option>
      {/each}
    </select>
    {#if state.catalogStatus === 'ready' && state.visionModels.length === 0}
      <p class="openrouter-settings__empty" role="status">
        {$_('settings.openRouter.models.noVisionModels')}
      </p>
    {/if}
  </div>

  <div class="openrouter-settings__field">
    <label for="openrouter-transfer-model">{$_('settings.openRouter.models.transferLabel')}</label>
    <select
      id="openrouter-transfer-model"
      class="app-input"
      data-testid="openrouter-transfer-model"
      value={state.selectedTransferModelId ?? ''}
      disabled={state.catalogStatus !== 'ready' || state.transferModels.length === 0}
      on:change={handleTransferModelChange}
    >
      <option value="">{$_('settings.openRouter.models.placeholder')}</option>
      {#each state.transferModels as model (model.id)}
        <option value={model.id}>{model.label}</option>
      {/each}
    </select>
    {#if state.catalogStatus === 'ready' && state.transferModels.length === 0}
      <p class="openrouter-settings__empty" role="status">
        {$_('settings.openRouter.models.noTransferModels')}
      </p>
    {/if}
  </div>

  {#if state.catalogStatus === 'ready'}
    <div class="openrouter-settings__field" data-testid="openrouter-transfer-prompt-field">
      <label for="openrouter-transfer-prompt">
        {$_('settings.openRouter.prompt.label')}
      </label>
      <textarea
        id="openrouter-transfer-prompt"
        class="app-input openrouter-settings__prompt"
        data-testid="openrouter-transfer-prompt"
        rows="14"
        value={state.transferPrompt}
        on:input={handleTransferPromptInput}
        aria-describedby="openrouter-prompt-help"
      ></textarea>
      <p id="openrouter-prompt-help" class="openrouter-settings__help">
        {$_('settings.openRouter.prompt.help')}
      </p>
      <button
        class="app-button app-button--secondary openrouter-settings__reset-prompt"
        type="button"
        data-testid="openrouter-reset-prompt-button"
        disabled={state.transferPromptUsesDefault}
        on:click={() => controller.resetTransferPrompt()}
      >
        {$_('settings.openRouter.prompt.reset')}
      </button>
    </div>
  {/if}

  <p
    class:openrouter-settings__ready={state.configurationIsReady}
    class:openrouter-settings__not-ready={!state.configurationIsReady}
    data-testid="openrouter-configuration-status"
    role="status"
    aria-live="polite"
  >
    {state.configurationIsReady
      ? $_('settings.openRouter.configuration.ready')
      : $_('settings.openRouter.configuration.notReady')}
  </p>
</section>

<style>
  .openrouter-settings {
    display: grid;
    gap: 0.9rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
    border-radius: var(--radius-lg);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .openrouter-settings__header,
  .openrouter-settings__privacy,
  .openrouter-settings__field,
  .openrouter-settings__key-form {
    display: grid;
    gap: 0.45rem;
  }

  .openrouter-settings__header h3,
  .openrouter-settings__header p,
  .openrouter-settings__privacy h4,
  .openrouter-settings__privacy p,
  .openrouter-settings__help,
  .openrouter-settings__status,
  .openrouter-settings__empty,
  .openrouter-settings__error p,
  .openrouter-settings__ready,
  .openrouter-settings__not-ready {
    margin: 0;
  }

  .openrouter-settings__header h3 {
    font-size: 1rem;
  }

  .openrouter-settings__header p,
  .openrouter-settings__help,
  .openrouter-settings__status,
  .openrouter-settings__empty {
    color: var(--text-secondary);
  }

  .openrouter-settings__privacy {
    padding: 0.85rem;
    border-left: 0.25rem solid var(--accent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }

  .openrouter-settings__privacy h4 {
    font-size: 0.9rem;
  }

  .openrouter-settings__privacy p,
  .openrouter-settings__help,
  .openrouter-settings__empty {
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .openrouter-settings__configured-key {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.85rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--positive) 10%, var(--surface));
    font-weight: 650;
  }

  .openrouter-settings label {
    font-size: 0.85rem;
    font-weight: 650;
    color: var(--text-secondary);
  }

  .openrouter-settings__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .openrouter-settings__error {
    display: grid;
    gap: 0.6rem;
    padding: 0.8rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--negative) 12%, var(--surface));
    color: color-mix(in srgb, var(--negative) 72%, var(--text-primary));
  }

  .openrouter-settings__prompt {
    min-height: 16rem;
    resize: vertical;
    line-height: 1.45;
  }

  .openrouter-settings__reset-prompt {
    width: fit-content;
  }

  .openrouter-settings__ready,
  .openrouter-settings__not-ready {
    padding: 0.75rem 0.85rem;
    border-radius: var(--radius-md);
    font-weight: 650;
  }

  .openrouter-settings__ready {
    background: color-mix(in srgb, var(--positive) 12%, var(--surface));
  }

  .openrouter-settings__not-ready {
    background: color-mix(in srgb, var(--border) 45%, var(--surface));
    color: var(--text-secondary);
  }

  @media (max-width: 30rem) {
    .openrouter-settings__actions :global(.app-button) {
      width: 100%;
    }
  }
</style>
