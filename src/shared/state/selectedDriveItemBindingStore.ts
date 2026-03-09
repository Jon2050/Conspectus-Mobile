// Provides an app-level in-memory store for the currently selected OneDrive database binding.
import { writable, type Readable } from 'svelte/store';
import type { DriveItemBinding } from '@graph';

export interface SelectedDriveItemBindingStore extends Readable<DriveItemBinding | null> {
  setBinding(binding: DriveItemBinding): void;
  clear(): void;
}

export const createSelectedDriveItemBindingStore = (
  initialBinding: DriveItemBinding | null = null,
): SelectedDriveItemBindingStore => {
  const { subscribe, set } = writable<DriveItemBinding | null>(initialBinding);

  return {
    subscribe,
    setBinding: (binding) => set(binding),
    clear: () => set(null),
  };
};

export const appSelectedDriveItemBindingStore = createSelectedDriveItemBindingStore();
