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
  readonly browserIsOpen: boolean;
  readonly operation: SettingsFileBindingOperation;
  readonly error: SettingsFileBindingError | null;
  readonly hasLoaded: boolean;
  readonly canGoBack: boolean;
}

export type SettingsFileBindingStateListener = (state: SettingsFileBindingState) => void;

export interface SettingsFileBindingController {
  getState(): SettingsFileBindingState;
  subscribe(listener: SettingsFileBindingStateListener): () => void;
  hydrateSelectedBinding(binding: DriveItemBinding | null): void;
  browseRoot(): Promise<void>;
  cancelBrowse(): void;
  openFolder(item: GraphDriveItem): Promise<void>;
  goBack(): Promise<void>;
  selectFile(item: GraphDriveItem): void;
  reset(): void;
}

interface CreateSettingsFileBindingControllerOptions {
  readonly initialSelectedBinding?: DriveItemBinding | null;
  readonly onBindingChange?: (binding: DriveItemBinding | null) => void;
  readonly browseTimeoutMs?: number;
}

interface LoadItemsFailureFallback {
  readonly folderStack: readonly DriveFolderReference[];
  readonly items: readonly GraphDriveItem[];
  readonly hasLoaded: boolean;
}

const DEFAULT_BROWSE_TIMEOUT_MS = 15_000;

const INITIAL_STATE: SettingsFileBindingState = {
  selectedBinding: null,
  currentFolder: null,
  items: [],
  browserIsOpen: false,
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
  options: CreateSettingsFileBindingControllerOptions = {},
): SettingsFileBindingController => {
  const browseTimeoutMs = options.browseTimeoutMs ?? DEFAULT_BROWSE_TIMEOUT_MS;
  let state: SettingsFileBindingState = {
    ...INITIAL_STATE,
    selectedBinding: options.initialSelectedBinding ?? null,
  };
  let folderStack: readonly DriveFolderReference[] = [];
  let activeRequestId = 0;
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

  const beginRequest = (): number => {
    activeRequestId += 1;
    return activeRequestId;
  };

  const isStaleRequest = (requestId: number): boolean => requestId !== activeRequestId;

  const createBrowseTimeoutError = (): SettingsFileBindingError => ({
    code: 'network_error',
    message: 'Loading OneDrive files took too long. Try again.',
  });

  const loadItems = async (
    folder?: DriveFolderReference,
    failureFallback?: LoadItemsFailureFallback,
  ): Promise<void> => {
    const requestId = beginRequest();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    updateState({
      browserIsOpen: true,
      operation: 'loading',
      error: null,
    });

    try {
      const items = await Promise.race([
        graphClient.listChildren(folder),
        new Promise<readonly GraphDriveItem[]>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(createBrowseTimeoutError());
          }, browseTimeoutMs);
        }),
      ]);
      if (isStaleRequest(requestId)) {
        return;
      }

      updateState({
        items: items.filter(isSelectableDatabaseFile),
        browserIsOpen: true,
        operation: 'idle',
        error: null,
        hasLoaded: true,
      });
    } catch (error) {
      if (isStaleRequest(requestId)) {
        return;
      }

      if (failureFallback !== undefined) {
        folderStack = failureFallback.folderStack;
      }

      updateState({
        items: failureFallback?.items ?? [],
        browserIsOpen: true,
        operation: 'idle',
        error: toBindingError(error, 'Failed to load OneDrive files.'),
        hasLoaded: failureFallback?.hasLoaded ?? true,
      });
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
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

    hydrateSelectedBinding(binding: DriveItemBinding | null): void {
      beginRequest();
      folderStack = [];
      updateState({
        selectedBinding: binding,
        browserIsOpen: false,
        items: [],
        operation: 'idle',
        error: null,
        hasLoaded: false,
      });
    },

    async browseRoot(): Promise<void> {
      if (state.operation !== 'idle') {
        return;
      }

      folderStack = [];
      await loadItems();
    },

    cancelBrowse(): void {
      beginRequest();
      folderStack = [];
      updateState({
        browserIsOpen: false,
        items: [],
        operation: 'idle',
        error: null,
        hasLoaded: false,
      });
    },

    async openFolder(item: GraphDriveItem): Promise<void> {
      if (state.operation !== 'idle' || item.kind !== 'folder') {
        return;
      }

      const previousFolderStack = folderStack;
      const previousItems = state.items;
      const previousHasLoaded = state.hasLoaded;
      folderStack = [
        ...folderStack,
        {
          driveId: item.driveId,
          itemId: item.itemId,
          path: joinFolderPath(item.parentPath, item.name),
        },
      ];
      await loadItems(folderStack.at(-1), {
        folderStack: previousFolderStack,
        items: previousItems,
        hasLoaded: previousHasLoaded,
      });
    },

    async goBack(): Promise<void> {
      if (state.operation !== 'idle' || folderStack.length === 0) {
        return;
      }

      const previousFolderStack = folderStack;
      const previousItems = state.items;
      const previousHasLoaded = state.hasLoaded;
      folderStack = folderStack.slice(0, -1);
      await loadItems(folderStack.at(-1), {
        folderStack: previousFolderStack,
        items: previousItems,
        hasLoaded: previousHasLoaded,
      });
    },

    selectFile(item: GraphDriveItem): void {
      try {
        const selectedBinding = validateSelectedBinding(item);
        folderStack = [];
        updateState({
          selectedBinding,
          browserIsOpen: false,
          items: [],
          hasLoaded: false,
          error: null,
        });
        options.onBindingChange?.(selectedBinding);
      } catch (error) {
        updateState({
          error: toBindingError(error, 'Failed to validate the selected OneDrive file.'),
        });
      }
    },

    reset(): void {
      beginRequest();
      folderStack = [];
      state = INITIAL_STATE;
      options.onBindingChange?.(null);
      emitState();
    },
  };
};
