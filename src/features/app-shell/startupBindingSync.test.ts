import { describe, expect, it, vi } from 'vitest';

import { syncSelectedDriveItemBindingStoreAtStartup } from './startupBindingSync';

describe('syncSelectedDriveItemBindingStoreAtStartup', () => {
  it('hydrates binding store for the active authenticated account', () => {
    const setActiveAccountId = vi.fn<(accountId: string | null) => void>();

    syncSelectedDriveItemBindingStoreAtStartup(
      {
        isAuthenticated: true,
        account: {
          homeAccountId: 'account-1',
          username: 'user@example.com',
          displayName: 'User',
        },
      },
      { setActiveAccountId },
    );

    expect(setActiveAccountId).toHaveBeenCalledWith('account-1');
  });

  it('clears binding store account context when signed out', () => {
    const setActiveAccountId = vi.fn<(accountId: string | null) => void>();

    syncSelectedDriveItemBindingStoreAtStartup(
      {
        isAuthenticated: false,
        account: null,
      },
      { setActiveAccountId },
    );

    expect(setActiveAccountId).toHaveBeenCalledWith(null);
  });
});
