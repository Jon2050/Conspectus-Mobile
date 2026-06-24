// Verifies remaining placeholder routes keep stable baseline content contracts.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import SettingsRoute from './SettingsRoute.svelte';

describe('route placeholder components', () => {
  it('renders settings route with sign-in controls and auth status messaging', () => {
    const { body } = render(SettingsRoute);

    expect(body).toContain('data-testid="route-settings"');
    expect(body).toContain('<h2>Einstellungen</h2>');
    expect(body).toContain('Mit Microsoft anmelden');
    expect(body).toContain('data-testid="auth-status-message"');
    expect(body).toContain('Abgemeldet.');
  });
});
