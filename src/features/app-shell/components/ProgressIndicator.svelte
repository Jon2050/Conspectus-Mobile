<!-- Renders determinate byte progress or an indeterminate status for active sync operations. -->
<script lang="ts">
  import { _ } from 'svelte-i18n';

  export let loaded: number;
  export let total: number | null;
  export let kind: 'download' | 'upload';
  export let statusText: string | null = null;
  $: awaitingConfirmation = kind === 'upload' && total !== null && total > 0 && loaded >= total;

  $: progressText =
    statusText ??
    (awaitingConfirmation
      ? $_('appShell.uploadAwaitingConfirmation')
      : total !== null
        ? $_(`appShell.${kind}Progress`, {
            values: {
              loaded: Math.round(loaded / 1024),
              total: Math.round(total / 1024),
            },
          })
        : $_(`appShell.${kind}edKb`, {
            values: { kb: Math.round(loaded / 1024) },
          }));
</script>

<div class="progress-indicator" data-testid="progress-indicator" data-kind={kind}>
  {#if awaitingConfirmation || total === null}
    <progress data-testid="progress-bar"></progress>
  {:else}
    <progress max={total} value={loaded} data-testid="progress-bar"></progress>
  {/if}
  <span class="progress-text" data-testid="progress-text">
    {progressText}
  </span>
</div>

<style>
  .progress-indicator {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  progress {
    width: 100%;
    height: 6px;
    border: none;
    border-radius: var(--radius-sm);
    background-color: rgba(0, 0, 0, 0.1);
  }

  progress::-webkit-progress-bar {
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: var(--radius-sm);
  }

  progress::-webkit-progress-value {
    background-color: currentColor;
    border-radius: var(--radius-sm);
  }

  progress::-moz-progress-bar {
    background-color: currentColor;
    border-radius: var(--radius-sm);
  }

  .progress-text {
    font-size: 0.75rem;
    opacity: 0.8;
    align-self: flex-end;
  }
</style>
