<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { BuildInfo } from '@shared';
  import { formatSettingsTimestampUtc } from './settingsInformation';
  import SettingsSection from './SettingsSection.svelte';
  let {
    buildInfo,
  }: {
    buildInfo: BuildInfo;
  } = $props();
</script>

<SettingsSection title={$_('settings.build.heading')} testId="settings-build-section">
  <section class="settings-screen__information" data-testid="settings-build-information">
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
</SettingsSection>
