<!-- Renders the shared end-of-page deployment footer using locally available app build metadata. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    formatBuildInfoLabel,
    getFallbackBuildInfo,
    loadBuildInfo,
    type BuildInfo,
  } from '@shared';

  export let isVisible = false;

  let buildInfo: BuildInfo = getFallbackBuildInfo();
  let footerLabel = formatBuildInfoLabel(buildInfo);

  const updateFooterLabel = (nextBuildInfo: BuildInfo): void => {
    buildInfo = nextBuildInfo;
    footerLabel = formatBuildInfoLabel(nextBuildInfo);
  };

  onMount(() => {
    void (async () => {
      updateFooterLabel(await loadBuildInfo());
    })();
  });
</script>

<footer
  class="deployment-info-footer"
  class:is-visible={isVisible}
  data-testid="deployment-info-footer"
  aria-hidden={isVisible ? undefined : 'true'}
>
  <p class="deployment-info-footer__text" data-testid="deployment-info-label">
    {footerLabel}
  </p>
</footer>

<style>
  .deployment-info-footer {
    margin-top: auto;
    padding: 0.45rem 1rem calc(0.25rem + env(safe-area-inset-bottom, 0));
    opacity: 0;
    transform: translateY(0.35rem);
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
    pointer-events: none;
  }

  .deployment-info-footer.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  .deployment-info-footer__text {
    margin: 0;
    text-align: center;
    font-size: 0.78rem;
    letter-spacing: 0.02em;
    color: color-mix(in srgb, var(--text-secondary) 82%, var(--text-primary) 18%);
  }
</style>
