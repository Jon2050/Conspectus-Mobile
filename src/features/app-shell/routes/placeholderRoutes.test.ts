import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import AccountsRoute from './AccountsRoute.svelte';
import AddRoute from './AddRoute.svelte';
import SettingsRoute from './SettingsRoute.svelte';
import TransfersRoute from './TransfersRoute.svelte';

describe('route placeholder components', () => {
  it.each([
    {
      component: AccountsRoute,
      testId: 'route-accounts',
      heading: 'Accounts',
      bodyText: 'Accounts route placeholder for upcoming balance and account cards.',
    },
    {
      component: TransfersRoute,
      testId: 'route-transfers',
      heading: 'Transfers',
      bodyText: 'Transfers route placeholder for monthly transfer list and swipe navigation.',
    },
    {
      component: AddRoute,
      testId: 'route-add',
      heading: 'Add',
      bodyText: 'Add route placeholder for transfer creation form and validation states.',
    },
  ])(
    'renders $testId with stable placeholder content',
    ({ component, testId, heading, bodyText }) => {
      const { body } = render(component);

      expect(body).toContain(`data-testid="${testId}"`);
      expect(body).toContain(`<h2>${heading}</h2>`);
      expect(body).toContain(`<p>${bodyText}</p>`);
    },
  );

  it('renders settings route with sign-in controls and auth status messaging', () => {
    const { body } = render(SettingsRoute);

    expect(body).toContain('data-testid="route-settings"');
    expect(body).toContain('<h2>Settings</h2>');
    expect(body).toContain('Sign in with Microsoft');
    expect(body).toContain('data-testid="auth-status-message"');
    expect(body).toContain('Signed out.');
  });
});
