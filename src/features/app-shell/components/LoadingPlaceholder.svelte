<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<section class="placeholder-state" data-testid="loading-placeholder" aria-live="polite">
  <h2>{$_('loadingPlaceholder.title')}</h2>
  <p>{$_('loadingPlaceholder.description')}</p>
</section>
