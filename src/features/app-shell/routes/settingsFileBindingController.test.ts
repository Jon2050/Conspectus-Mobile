// Tests the settings-route file browser controller for browse, navigation, selection, and errors.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphClient, GraphDriveItem } from '@graph';

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

const FINANCE_ITEMS: readonly GraphDriveItem[] = [
  {
    driveId: 'drive-123',
    itemId: 'file-3',
    name: 'budget.db',
    parentPath: '/Finance',
    kind: 'file',
  },
];

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

  beforeEach(() => {
    harness = createGraphClientHarness();
  });

  it('loads root items and keeps only folders and .db files', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient);

    await controller.browseRoot();

    expect(controller.getState()).toEqual({
      selectedBinding: null,
      currentFolder: null,
      items: [ROOT_FOLDER_ITEM, ROOT_DB_FILE_ITEM],
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
    const controller = createSettingsFileBindingController(harness.graphClient);
    await controller.browseRoot();

    controller.selectFile(ROOT_DB_FILE_ITEM);

    expect(controller.getState().selectedBinding).toEqual({
      driveId: 'drive-123',
      itemId: 'file-1',
      name: 'conspectus.db',
      parentPath: '/',
    });
    expect(controller.getState().error).toBeNull();
  });

  it('rejects invalid non-database file selections', () => {
    const controller = createSettingsFileBindingController(harness.graphClient);

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
  });

  it('rejects file selections that are missing required binding identifiers', () => {
    const controller = createSettingsFileBindingController(harness.graphClient);

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

  it('resets the current browse and selected binding state', async () => {
    const controller = createSettingsFileBindingController(harness.graphClient);
    await controller.browseRoot();
    controller.selectFile(ROOT_DB_FILE_ITEM);

    controller.reset();

    expect(controller.getState()).toEqual({
      selectedBinding: null,
      currentFolder: null,
      items: [],
      operation: 'idle',
      error: null,
      hasLoaded: false,
      canGoBack: false,
    });
  });
});
