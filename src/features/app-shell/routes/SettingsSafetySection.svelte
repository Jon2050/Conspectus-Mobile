<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<section
  class="settings-screen__safety-card"
  data-testid="settings-safety-recovery"
  aria-labelledby="settings-safety-heading"
>
  <h3 id="settings-safety-heading">{$_('settings.safety.heading')}</h3>
  <p class="settings-screen__safety-warning">{$_('settings.safety.warning')}</p>
  <p>{$_('settings.safety.explanation')}</p>

  <h4>{$_('settings.safety.recoveryHeading')}</h4>
  <p>{$_('settings.safety.recoveryDescription')}</p>
  <a
    class="settings-screen__safety-link"
    href="https://support.microsoft.com/en-us/onedrive/restore-a-previous-version-of-a-file-stored-in-onedrive"
    target="_blank"
    rel="noopener noreferrer"
  >
    {$_('settings.safety.recoveryLink')}
  </a>
</section>
