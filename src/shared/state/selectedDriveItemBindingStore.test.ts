// Verifies the app-level selected OneDrive binding store can set and clear bindings predictably.
import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';

import { createSelectedDriveItemBindingStore } from './selectedDriveItemBindingStore';

describe('createSelectedDriveItemBindingStore', () => {
  it('starts empty by default', () => {
    const store = createSelectedDriveItemBindingStore();

    expect(get(store)).toBeNull();
  });

  it('stores and clears the selected binding', () => {
    const store = createSelectedDriveItemBindingStore();
    const binding = {
      driveId: 'drive-123',
      itemId: 'item-456',
      name: 'conspectus.db',
      parentPath: '/Finance',
    } as const;

    store.setBinding(binding);
    expect(get(store)).toEqual(binding);

    store.clear();
    expect(get(store)).toBeNull();
  });
});
