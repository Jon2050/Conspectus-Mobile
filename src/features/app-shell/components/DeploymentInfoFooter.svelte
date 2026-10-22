<!-- Renders compact build metadata below the persistent primary navigation. -->
<script lang="ts">
  import { formatBuildInfoLabel, getBuildInfo } from '@shared';

  const footerLabel = formatBuildInfoLabel(getBuildInfo());
</script>

<footer class="deployment-info-footer" data-testid="deployment-info-footer">
  <p class="deployment-info-footer__text" data-testid="deployment-info-label">
    {footerLabel}
  </p>
</footer>

<style>
  .deployment-info-footer {
    padding: 0 0.25rem;
    overflow-wrap: anywhere;
  }

  .deployment-info-footer__text {
    margin: 0;
    text-align: center;
    font-size: 0.625rem;
    line-height: 1.2;
    color: color-mix(in srgb, var(--text-secondary) 82%, var(--text-primary) 18%);
  }
</style>
