// Tests the settings-route file browser controller for browse, navigation, selection, and errors.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveItemBinding, GraphClient, GraphDriveItem } from '@graph';

import { createSettingsFileBindingController } from './settingsFileBindingController';

const ROOT_FOLDER_ITEM: GraphDriveItem = {
  driveId: 'drive-123',
  itemId: 'folder-1',
  name: 'Finance',
  parentPath: '/',
  kind: 'folder',
};

const ROOT_DB_FILE_ITEM: GraphDriveItem = {
  driveId: 'drive-123',
  itemId: 'file-1',
  name: 'conspectus.db',
  parentPath: '/',
  kind: 'file',
};

const ROOT_NON_DB_FILE_ITEM: GraphDriveItem = {
  driveId: 'drive-123',
  itemId: 'file-2',
  name: 'notes.txt',
  parentPath: '/',
  kind: 'file',
};

const ROOT_ITEMS: readonly GraphDriveItem[] = [
  ROOT_FOLDER_ITEM,
  ROOT_DB_FILE_ITEM,
  ROOT_NON_DB_FILE_ITEM,
];

const FINANCE_DB_FILE_ITEM: GraphDriveItem = {
  driveId: 'drive-123',
  itemId: 'file-3',
  name: 'budget.db',
  parentPath: '/Finance',
  kind: 'file',
};

const FINANCE_ITEMS: readonly GraphDriveItem[] = [FINANCE_DB_FILE_ITEM];

const createDeferred = <T>(): { promise: Promise<T>; resolve(value: T): void } => {
  let resolvePromise: (value: T) => void = () => {};

  return {
    promise: new Promise<T>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve: (value: T) => {
      resolvePromise(value);
    },
  };
};

const createGraphClientHarness = (): {
  readonly graphClient: GraphClient;
  readonly listChildren: ReturnType<typeof vi.fn>;
} => {
  const listChildren = vi.fn(async (folder) => {
    if (folder === undefined) {
      return ROOT_ITEMS;
    }

    if (folder.itemId === 'folder-1') {
      return FINANCE_ITEMS;
    }

    return [];
  });

  return {
    graphClient: {
      listChildren,
      getFileMetadata: vi.fn(async () => ({
        eTag: '"etag-1"',
        sizeBytes: 2048,
        lastModifiedDateTime: '2026-03-09T10:15:00Z',
      })),
      downloadFile: vi.fn(async () => Uint8Array.from([1, 2, 3])),
      uploadFile: vi.fn(async () => ({
        eTag: '"etag-2"',
        sizeBytes: 2048,
        lastModifiedDateTime: '2026-03-09T11:15:00Z',
      })),
    },
    listChildren,
  };
};

describe('settings file binding controller', () => {
  let harness: ReturnType<typeof createGraphClientHarness>;
  let onBindingChange: ReturnType<typeof vi.fn<(binding: DriveItemBinding | null) => void>>;

  beforeEach(() => {
    harness = createGraphClientHarness();
    onBindingChange = vi.fn<(binding: DriveItemBinding | null) => void>();
  });

  it('loads root items and keeps only folders and .db files', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient);

    await controller.browseRoot();

    expect(controller.getState()).toEqual({
      selectedBinding: null,
      currentFolder: null,
      items: [ROOT_FOLDER_ITEM, ROOT_DB_FILE_ITEM],
      browserIsOpen: true,
      operation: 'idle',
      error: null,
      hasLoaded: true,
      canGoBack: false,
    });
  });

  it('navigates into a folder and back to the root listing', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient);
    await controller.browseRoot();

    await controller.openFolder(ROOT_FOLDER_ITEM);

    expect(controller.getState().currentFolder).toEqual({
      driveId: 'drive-123',
      itemId: 'folder-1',
      path: '/Finance',
    });
    expect(controller.getState().items).toEqual(FINANCE_ITEMS);
    expect(controller.getState().canGoBack).toBe(true);

    await controller.goBack();

    expect(controller.getState().currentFolder).toBeNull();
    expect(controller.getState().items).toEqual([ROOT_FOLDER_ITEM, ROOT_DB_FILE_ITEM]);
    expect(controller.getState().canGoBack).toBe(false);
  });

  it('stores a validated file binding when a .db file is selected', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });
    await controller.browseRoot();

    controller.selectFile(ROOT_DB_FILE_ITEM);

    expect(controller.getState().selectedBinding).toEqual({
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
    expect(controller.getState().browserIsOpen).toBe(false);
    expect(controller.getState().items).toEqual([]);
    expect(controller.getState().hasLoaded).toBe(false);
    expect(controller.getState().canGoBack).toBe(false);
    expect(controller.getState().error).toBeNull();
    expect(onBindingChange).toHaveBeenCalledWith({
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
  });

  it('rejects invalid non-database file selections', () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });

    controller.selectFile(ROOT_NON_DB_FILE_ITEM);

    expect(controller.getState().selectedBinding).toBeNull();
    expect(controller.getState().error).toEqual({
      code: 'invalid_selection',
      message: 'Selected file must use the .db extension.',
      cause: {
        code: 'invalid_selection',
        message: 'Selected file must use the .db extension.',
      },
    });
    expect(onBindingChange).not.toHaveBeenCalled();
  });

  it('rejects file selections that are missing required binding identifiers', () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });

    controller.selectFile({
      driveId: '',
      itemId: 'file-4',
      name: 'broken.db',
      parentPath: '/',
      kind: 'file',
    });

    expect(controller.getState().selectedBinding).toBeNull();
    expect(controller.getState().error).toEqual({
      code: 'invalid_selection',
      message: 'Selected file did not include the required OneDrive identifiers.',
      cause: {
        code: 'invalid_selection',
        message: 'Selected file did not include the required OneDrive identifiers.',
      },
    });
    expect(onBindingChange).not.toHaveBeenCalled();
  });

  it('preserves a previous valid binding when a later invalid selection is made', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });
    await controller.browseRoot();

    controller.selectFile(ROOT_DB_FILE_ITEM);
    controller.selectFile(ROOT_NON_DB_FILE_ITEM);

    expect(controller.getState().selectedBinding).toEqual({
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
    expect(controller.getState().browserIsOpen).toBe(false);
    expect(controller.getState().error).toEqual({
      code: 'invalid_selection',
      message: 'Selected file must use the .db extension.',
      cause: {
        code: 'invalid_selection',
        message: 'Selected file must use the .db extension.',
      },
    });
    expect(onBindingChange).toHaveBeenNthCalledWith(1, {
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
    expect(onBindingChange).toHaveBeenCalledTimes(1);
  });

  it('hydrates the initial selected binding from controller options', () => {
    const initialSelectedBinding = {
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/Finance',
    } as const;
    const controller = createSettingsFileBindingController(harness.graphClient, {
      initialSelectedBinding,
      onBindingChange,
    });

    expect(controller.getState().selectedBinding).toEqual(initialSelectedBinding);
    expect(onBindingChange).not.toHaveBeenCalled();
  });

  it('hydrates a selected binding without triggering binding change callbacks', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });
    await controller.browseRoot();

    controller.hydrateSelectedBinding({
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });

    expect(controller.getState()).toEqual({
      selectedBinding: {
        driveId: 'drive-123',
        itemId: 'file-1',
        name: 'conspectus.db',
        parentPath: '/',
      },
      currentFolder: null,
      items: [],
      browserIsOpen: false,
      operation: 'idle',
      error: null,
      hasLoaded: false,
      canGoBack: false,
    });
    expect(onBindingChange).not.toHaveBeenCalled();
  });

  it('reopens the browser from root even when a binding is already selected', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });

    await controller.browseRoot();
    controller.selectFile(ROOT_DB_FILE_ITEM);
    await controller.browseRoot();

    expect(controller.getState().selectedBinding).toEqual({
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
    expect(controller.getState().browserIsOpen).toBe(true);
    expect(controller.getState().items).toEqual([ROOT_FOLDER_ITEM, ROOT_DB_FILE_ITEM]);
    expect(controller.getState().hasLoaded).toBe(true);
    expect(controller.getState().canGoBack).toBe(false);
  });

  it('rebinds to a different database file from an already selected binding', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });

    await controller.browseRoot();
    controller.selectFile(ROOT_DB_FILE_ITEM);
    await controller.browseRoot();
    await controller.openFolder(ROOT_FOLDER_ITEM);
    controller.selectFile(FINANCE_DB_FILE_ITEM);

    expect(controller.getState().selectedBinding).toEqual({
      driveId: 'drive-123',
      itemId: 'file-3',
      name: 'budget.db',
      parentPath: '/Finance',
    });
    expect(onBindingChange).toHaveBeenNthCalledWith(1, {
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
    expect(onBindingChange).toHaveBeenNthCalledWith(2, {
      driveId: 'drive-123',
      itemId: 'file-3',
      name: 'budget.db',
      parentPath: '/Finance',
    });
  });

  it('captures graph browse failures as controller errors', async () => {
    harness.listChildren.mockRejectedValueOnce({
      code: 'network_error',
      message: 'OneDrive is unavailable.',
    });
    const controller = createSettingsFileBindingController(harness.graphClient);

    await controller.browseRoot();

    expect(controller.getState().error).toEqual({
      code: 'network_error',
      message: 'OneDrive is unavailable.',
      status: undefined,
      cause: undefined,
    });
    expect(controller.getState().items).toEqual([]);
    expect(controller.getState().operation).toBe('idle');
  });

  it('ignores stale browse results that resolve after reset', async () => {
    const browseDeferred = createDeferred<readonly GraphDriveItem[]>();
    harness.listChildren.mockImplementationOnce(async () => browseDeferred.promise);
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });

    const browsePromise = controller.browseRoot();
    expect(controller.getState().operation).toBe('loading');

    controller.reset();
    browseDeferred.resolve(ROOT_ITEMS);
    await browsePromise;

    expect(controller.getState()).toEqual({
      selectedBinding: null,
      currentFolder: null,
      items: [],
      browserIsOpen: false,
      operation: 'idle',
      error: null,
      hasLoaded: false,
      canGoBack: false,
    });
    expect(onBindingChange).toHaveBeenCalledWith(null);
  });

  it('resets the current browse and selected binding state', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient, {
      onBindingChange,
    });
    await controller.browseRoot();
    controller.selectFile(ROOT_DB_FILE_ITEM);

    controller.reset();

    expect(controller.getState()).toEqual({
      selectedBinding: null,
      currentFolder: null,
      items: [],
      browserIsOpen: false,
      operation: 'idle',
      error: null,
      hasLoaded: false,
      canGoBack: false,
    });
    expect(onBindingChange).toHaveBeenLastCalledWith(null);
  });
});
