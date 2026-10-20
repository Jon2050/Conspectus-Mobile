<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { BuildInfo } from '@shared';
  import { formatSettingsTimestampUtc } from './settingsInformation';
  let {
    buildInfo,
  }: {
    buildInfo: BuildInfo;
  } = $props();
</script>

<section class="settings-screen__information" data-testid="settings-build-information">
  <h3 class="settings-screen__subheading">{$_('settings.build.heading')}</h3>
  <dl class="settings-screen__information-list">
    <div>
      <dt>{$_('settings.build.version')}</dt>
      <dd data-testid="settings-build-version">{buildInfo.version}</dd>
    </div>
    <div>
      <dt>{$_('settings.build.builtReleased')}</dt>
      <dd data-testid="settings-build-time">
        {formatSettingsTimestampUtc(buildInfo.buildTimeUtc) || $_('settings.build.unknown')}
      </dd>
    </div>
  </dl>
</section>
