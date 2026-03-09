// Synchronizes the selected OneDrive binding store with the active authenticated account at app startup.
import type { AuthSession } from '@auth';
import type { SelectedDriveItemBindingStore } from '@shared';

const resolveActiveAccountId = (session: AuthSession): string | null => {
  if (!session.isAuthenticated) {
    return null;
  }

  return session.account?.homeAccountId ?? null;
};

export const syncSelectedDriveItemBindingStoreAtStartup = (
  session: AuthSession,
  selectedDriveItemBindingStore: Pick<SelectedDriveItemBindingStore, 'setActiveAccountId'>,
): void => {
  selectedDriveItemBindingStore.setActiveAccountId(resolveActiveAccountId(session));
};
