// Guards the AppShell source contract that releases persistent startup feedback on teardown.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const APP_SHELL_SOURCE = readFileSync(new URL('./AppShell.svelte', import.meta.url), 'utf8');

describe('AppShell lifecycle', () => {
  it('clears the startup sync toast from the registered destroy callback', () => {
    expect(APP_SHELL_SOURCE).toMatch(
      /onDestroy\(\(\) => \{\s*clearStartupSyncToast\(syncStateStore\);/u,
    );
  });
});
