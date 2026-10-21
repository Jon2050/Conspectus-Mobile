<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    testId,
    children,
  }: {
    title: string;
    testId: string;
    children: Snippet;
  } = $props();
</script>

<details class="settings-section" data-testid={testId}>
  <summary class="settings-section__heading">{title}</summary>
  <div class="settings-section__content">
    {@render children()}
  </div>
</details>

<style>
  .settings-section {
    min-width: 0;
    border-radius: var(--radius-md);
    background: var(--surface-strong);
    box-shadow: var(--shadow-sm);
  }

  .settings-section__heading {
    min-height: 2.75rem;
    padding: 0.85rem;
    font-weight: 650;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .settings-section__content {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    min-width: 0;
    padding: 0 0.85rem 0.85rem;
  }
</style>
