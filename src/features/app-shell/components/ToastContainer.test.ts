// Verifies toast dismiss buttons render with safe button semantics.
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { appToastStore } from '@shared';

import ToastContainer from './ToastContainer.svelte';

describe('ToastContainer component', () => {
  afterEach(() => {
    appToastStore.clear();
  });

  it('renders each toast as an explicit non-submit button', () => {
    appToastStore.show('Syncing...', 'info', 0);

    const { body } = render(ToastContainer);

    expect(body).toContain('type="button"');
    expect(body).toContain('Syncing...');
  });
});
