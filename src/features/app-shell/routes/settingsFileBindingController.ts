// Manages the settings-route OneDrive file browser and validates selected database bindings.
import type {
  DriveFolderReference,
  DriveItemBinding,
  GraphClient,
  GraphDriveItem,
  GraphError,
  GraphErrorCode,
} from '@graph';

export type SettingsFileBindingOperation = 'idle' | 'loading';

export type SettingsFileBindingErrorCode = GraphErrorCode | 'invalid_selection';

export interface SettingsFileBindingError {
  readonly code: SettingsFileBindingErrorCode;
  readonly message: string;
  readonly status?: number;
  readonly cause?: unknown;
}

export interface SettingsFileBindingState {
  readonly selectedBinding: DriveItemBinding | null;
  readonly currentFolder: DriveFolderReference | null;
  readonly items: readonly GraphDriveItem[];
  readonly operation: SettingsFileBindingOperation;
  readonly error: SettingsFileBindingError | null;
  readonly hasLoaded: boolean;
  readonly canGoBack: boolean;
}

export type SettingsFileBindingStateListener = (state: SettingsFileBindingState) => void;

export interface SettingsFileBindingController {
  getState(): SettingsFileBindingState;
  subscribe(listener: SettingsFileBindingStateListener): () => void;
  browseRoot(): Promise<void>;
  openFolder(item: GraphDriveItem): Promise<void>;
  goBack(): Promise<void>;
  selectFile(item: GraphDriveItem): void;
  reset(): void;
}

const INITIAL_STATE: SettingsFileBindingState = {
  selectedBinding: null,
  currentFolder: null,
  items: [],
  operation: 'idle',
  error: null,
  hasLoaded: false,
  canGoBack: false,
};

const isGraphError = (value: unknown): value is GraphError => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const graphError = value as Partial<GraphError>;
  return typeof graphError.code === 'string' && typeof graphError.message === 'string';
};

const createGraphBindingError = (error: GraphError): SettingsFileBindingError => {
  return {
    code: error.code,
    message: error.message,
    cause: error.cause,
    ...(error.status !== undefined ? { status: error.status } : {}),
  };
};

const toBindingError = (error: unknown, fallbackMessage: string): SettingsFileBindingError => {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'invalid_selection' &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return {
      code: 'invalid_selection',
      message: (error as { message: string }).message,
      cause: error,
    };
  }

  if (isGraphError(error)) {
    return createGraphBindingError(error);
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      code: 'unknown',
      message: error.message,
      cause: error,
    };
  }

  return {
    code: 'unknown',
    message: fallbackMessage,
    cause: error,
  };
};

const joinFolderPath = (parentPath: string, name: string): string => {
  if (parentPath === '/') {
    return `/${name}`;
  }

  return `${parentPath}/${name}`;
};

const isSelectableDatabaseFile = (item: GraphDriveItem): boolean =>
  item.kind === 'folder' || item.name.toLowerCase().endsWith('.db');

const validateSelectedBinding = (item: GraphDriveItem): DriveItemBinding => {
  if (item.kind !== 'file') {
    throw {
      code: 'invalid_selection',
      message: 'Only database files can be selected.',
    } satisfies SettingsFileBindingError;
  }

  if (!item.name.toLowerCase().endsWith('.db')) {
    throw {
      code: 'invalid_selection',
      message: 'Selected file must use the .db extension.',
    } satisfies SettingsFileBindingError;
  }

  if (
    item.driveId.trim().length === 0 ||
    item.itemId.trim().length === 0 ||
    item.name.trim().length === 0 ||
    item.parentPath.trim().length === 0
  ) {
    throw {
      code: 'invalid_selection',
      message: 'Selected file did not include the required OneDrive identifiers.',
    } satisfies SettingsFileBindingError;
  }

  return {
    driveId: item.driveId,
    itemId: item.itemId,
    name: item.name,
    parentPath: item.parentPath,
  };
};

export const createSettingsFileBindingController = (
  graphClient: GraphClient,
): SettingsFileBindingController => {
  let state: SettingsFileBindingState = INITIAL_STATE;
  let folderStack: readonly DriveFolderReference[] = [];
  const listeners = new Set<SettingsFileBindingStateListener>();

  const emitState = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const updateState = (patch: Partial<SettingsFileBindingState>): void => {
    state = {
      ...state,
      ...patch,
      currentFolder: folderStack.at(-1) ?? null,
      canGoBack: folderStack.length > 0,
    };
    emitState();
  };

  const loadItems = async (folder?: DriveFolderReference): Promise<void> => {
    updateState({
      operation: 'loading',
      error: null,
    });

    try {
      const items = await graphClient.listChildren(folder);
      updateState({
        items: items.filter(isSelectableDatabaseFile),
        operation: 'idle',
        error: null,
        hasLoaded: true,
      });
    } catch (error) {
      updateState({
        items: [],
        operation: 'idle',
        error: toBindingError(error, 'Failed to load OneDrive files.'),
        hasLoaded: true,
      });
    }
  };

  return {
    getState(): SettingsFileBindingState {
      return state;
    },

    subscribe(listener: SettingsFileBindingStateListener): () => void {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },

    async browseRoot(): Promise<void> {
      if (state.operation !== 'idle') {
        return;
      }

      folderStack = [];
      await loadItems();
    },

    async openFolder(item: GraphDriveItem): Promise<void> {
      if (state.operation !== 'idle' || item.kind !== 'folder') {
        return;
      }

      folderStack = [
        ...folderStack,
        {
          driveId: item.driveId,
          itemId: item.itemId,
          path: joinFolderPath(item.parentPath, item.name),
        },
      ];
      await loadItems(folderStack.at(-1));
    },

    async goBack(): Promise<void> {
      if (state.operation !== 'idle' || folderStack.length === 0) {
        return;
      }

      folderStack = folderStack.slice(0, -1);
      await loadItems(folderStack.at(-1));
    },

    selectFile(item: GraphDriveItem): void {
      try {
        updateState({
          selectedBinding: validateSelectedBinding(item),
          error: null,
        });
      } catch (error) {
        updateState({
          error: toBindingError(error, 'Failed to validate the selected OneDrive file.'),
        });
      }
    },

    reset(): void {
      folderStack = [];
      state = INITIAL_STATE;
      emitState();
    },
  };
};
