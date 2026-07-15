// Provides deterministic localhost boundary mocks shared by Playwright browser journeys.
import type { Page } from '@playwright/test';

export const resolveAppBasePath = (): string => {
  const configuredBasePath = process.env.PLAYWRIGHT_APP_BASE_PATH?.trim();
  if (!configuredBasePath) {
    return '/';
  }

  const withLeadingSlash = configuredBasePath.startsWith('/')
    ? configuredBasePath
    : `/${configuredBasePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

export const APP_BASE_PATH = resolveAppBasePath();
export const RUNTIME_CLIENT_ID_PATTERN = /VITE_AZURE_CLIENT_ID:"[^"]*"/g;
export const appPath = (suffix = ''): string => `${APP_BASE_PATH}${suffix}`;
export const SQLITE_DATABASE_HEADER_BYTES = [
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
];
export const createSqliteBytes = (payloadBytes: readonly number[] = [1, 2, 3, 4]): number[] => [
  ...SQLITE_DATABASE_HEADER_BYTES,
  ...payloadBytes,
];
export const createMockGraphError = (
  code: string,
  message: string,
  status?: number,
): {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
} => ({
  code,
  message,
  ...(status === undefined ? {} : { status }),
});
export const REQUIRED_MANIFEST_ICONS = [
  {
    src: 'icons/moneysack192x192.png',
    sizes: '192x192',
  },
  {
    src: 'icons/moneysack512x512.png',
    sizes: '512x512',
  },
];

export const resolveCurrentMonthKey = async (page: Page): Promise<string> =>
  page.evaluate(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

export const dispatchTransferMonthSwipe = async (
  page: Page,
  deltaX: number,
  deltaY = 0,
): Promise<void> => {
  await page.getByTestId('transfers-month-swipe-surface').evaluate(
    (swipeSurface, swipeDelta) => {
      const element = swipeSurface as HTMLElement;
      const bounds = element.getBoundingClientRect();
      const startX = bounds.left + bounds.width / 2;
      const startY = bounds.top + bounds.height / 2;
      const endX = startX + swipeDelta.deltaX;
      const endY = startY + swipeDelta.deltaY;

      const createTouchList = (
        x: number,
        y: number,
      ): ArrayLike<{ clientX: number; clientY: number }> => {
        const point = {
          clientX: x,
          clientY: y,
        };

        return {
          0: point,
          length: 1,
          item(index: number) {
            return index === 0 ? point : null;
          },
        };
      };
      const dispatchTouch = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        touches: ArrayLike<{ clientX: number; clientY: number }>,
        changedTouches: ArrayLike<{ clientX: number; clientY: number }>,
      ): void => {
        const event = new Event(type, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'touches', {
          value: touches,
          configurable: true,
        });
        Object.defineProperty(event, 'changedTouches', {
          value: changedTouches,
          configurable: true,
        });
        element.dispatchEvent(event);
      };

      dispatchTouch('touchstart', createTouchList(startX, startY), createTouchList(startX, startY));
      dispatchTouch('touchmove', createTouchList(endX, endY), createTouchList(endX, endY));
      dispatchTouch('touchend', createTouchList(endX, endY), createTouchList(endX, endY));
    },
    {
      deltaX,
      deltaY,
    },
  );
};

export const inspectTransferMonthSwipeMove = async (
  page: Page,
  deltaX: number,
  deltaY = 0,
): Promise<{ defaultPrevented: boolean; trackTransform: string }> =>
  page.getByTestId('transfers-month-swipe-surface').evaluate(
    async (swipeSurface, swipeDelta) => {
      const element = swipeSurface as HTMLElement;
      const track = element.querySelector<HTMLElement>('.transfers-route__drag-track');
      const bounds = element.getBoundingClientRect();
      const startX = bounds.left + bounds.width / 2;
      const startY = bounds.top + bounds.height / 2;
      const endX = startX + swipeDelta.deltaX;
      const endY = startY + swipeDelta.deltaY;

      const createTouchList = (
        x: number,
        y: number,
      ): ArrayLike<{ clientX: number; clientY: number }> => {
        const point = {
          clientX: x,
          clientY: y,
        };

        return {
          0: point,
          length: 1,
          item(index: number) {
            return index === 0 ? point : null;
          },
        };
      };
      const dispatchTouch = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        touches: ArrayLike<{ clientX: number; clientY: number }>,
        changedTouches: ArrayLike<{ clientX: number; clientY: number }>,
      ): Event => {
        const event = new Event(type, {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, 'touches', {
          value: touches,
          configurable: true,
        });
        Object.defineProperty(event, 'changedTouches', {
          value: changedTouches,
          configurable: true,
        });
        element.dispatchEvent(event);
        return event;
      };

      dispatchTouch('touchstart', createTouchList(startX, startY), createTouchList(startX, startY));
      const moveEvent = dispatchTouch(
        'touchmove',
        createTouchList(endX, endY),
        createTouchList(endX, endY),
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      return {
        defaultPrevented: moveEvent.defaultPrevented,
        trackTransform: track?.style.transform ?? '',
      };
    },
    {
      deltaX,
      deltaY,
    },
  );

export type MockAuthClientOptions = {
  readonly initializeDelayMs?: number;
  readonly signInDelayMs?: number;
  readonly reauthenticateDelayMs?: number;
  readonly signOutDelayMs?: number;
  readonly consumeRedirectHashOnInitialize?: boolean;
  readonly failInitialize?: boolean;
  readonly failSignIn?: boolean;
  readonly failReauthenticate?: boolean;
  readonly failSignOut?: boolean;
  readonly failGetAccessToken?: boolean;
  readonly getAccessTokenErrorCode?: string;
  readonly startAuthenticated?: boolean;
};

export type MockGraphError = {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
};

export type MockGraphClientOptions = {
  readonly failListChildren?: boolean;
  readonly failGetFileMetadata?: boolean;
  readonly failDownloadFile?: boolean;
  readonly includeMalformedDbFile?: boolean;
  readonly listChildrenDelayMs?: number;
  readonly metadataDelayMs?: number;
  readonly downloadDelayMs?: number;
  readonly extraRootDbFileCount?: number;
  readonly metadataETag?: string;
  readonly metadataETagSequence?: readonly string[];
  readonly metadataLastModifiedDateTime?: string;
  readonly downloadBytes?: readonly number[];
  readonly metadataErrorSequence?: readonly MockGraphError[];
  readonly resolvedPathBinding?: {
    readonly driveId: string;
    readonly itemId: string;
    readonly name: string;
    readonly parentPath: string;
  };
  readonly resolvePathError?: MockGraphError;
  readonly downloadErrorSequence?: readonly MockGraphError[];
  readonly uploadErrorSequence?: readonly MockGraphError[];
  readonly uploadDelayMs?: number;
};

export type MockStartupSnapshot = {
  readonly binding?: {
    readonly driveId?: string;
    readonly itemId?: string;
    readonly name?: string;
    readonly parentPath?: string;
  };
  readonly metadata?: {
    readonly eTag?: string;
    readonly lastSyncAtIso?: string;
  };
  readonly dbBytes?: readonly number[];
};

export type MockCacheStoreOptions = {
  readonly failClearAll?: boolean;
  readonly clearAllDelayMs?: number;
  readonly startupSnapshot?: MockStartupSnapshot | null;
};

export type MockDbRuntimeAccountRow = {
  accountId: number;
  name: string;
  amountCents: number;
  accountTypeId?: number | null;
};

export type MockDbRuntimeTransferRow = {
  readonly transferId: number;
  readonly bookingDateEpochDay: number;
  readonly name: string;
  readonly amountCents: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly (number | null)[];
  readonly buyplace: string | null;
};

export type MockDbRuntimeOptions = {
  readonly accountRows?: readonly MockDbRuntimeAccountRow[];
  readonly fromAccountOptionRows?: readonly MockDbRuntimeAccountRow[];
  readonly toAccountOptionRows?: readonly MockDbRuntimeAccountRow[];
  readonly categoryRows?: readonly { readonly categoryId: number; readonly name: string }[];
  readonly transferRows?: readonly MockDbRuntimeTransferRow[];
  readonly failAccountsQuery?: boolean;
  readonly accountsQueryErrorCode?: string;
  readonly accountsQueryErrorMessage?: string;
  readonly forceAlwaysOpen?: boolean;
};

export const installMockAuthClient = async (
  page: Page,
  options: MockAuthClientOptions = {},
): Promise<void> => {
  await page.addInitScript((mockOptions: MockAuthClientOptions) => {
    const resolveDelay = (delayMs: number | undefined): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs ?? 0);
      });

    const account = {
      homeAccountId: 'mock-home-account',
      username: 'mock-user@example.com',
      displayName: 'Mock User',
    };

    let isInitialized = false;
    let isAuthenticated = mockOptions.startAuthenticated ?? false;
    const trackedWindow = window as typeof window & {
      __CONSPECTUS_REAUTHENTICATE_START_PAGES__?: string[];
    };
    trackedWindow.__CONSPECTUS_REAUTHENTICATE_START_PAGES__ = [];

    const toSession = () => ({
      isAuthenticated,
      account: isAuthenticated ? account : null,
    });

    (window as Window & { __CONSPECTUS_AUTH_CLIENT__?: unknown }).__CONSPECTUS_AUTH_CLIENT__ = {
      async initialize() {
        await resolveDelay(mockOptions.initializeDelayMs);
        if (mockOptions.failInitialize) {
          throw {
            code: 'network_error',
            message: 'Mock initialize failure.',
          };
        }

        if (mockOptions.consumeRedirectHashOnInitialize) {
          const hasRedirectAuthHash =
            window.location.hash.includes('code=') && window.location.hash.includes('state=');
          if (hasRedirectAuthHash) {
            isAuthenticated = true;
          }
        }

        isInitialized = true;
      },
      getSession() {
        if (!isInitialized) {
          return {
            isAuthenticated: false,
            account: null,
          };
        }

        return toSession();
      },
      async signIn() {
        await resolveDelay(mockOptions.signInDelayMs);
        if (mockOptions.failSignIn) {
          throw {
            code: 'network_error',
            message: 'Mock sign-in failure.',
          };
        }
        isAuthenticated = true;
      },
      async reauthenticate(redirectStartPage: string) {
        trackedWindow.__CONSPECTUS_REAUTHENTICATE_START_PAGES__?.push(redirectStartPage);
        await resolveDelay(mockOptions.reauthenticateDelayMs);
        if (mockOptions.failReauthenticate) {
          throw {
            code: 'network_error',
            message: 'Mock re-authentication failure.',
          };
        }
      },
      async signOut() {
        await resolveDelay(mockOptions.signOutDelayMs);
        if (mockOptions.failSignOut) {
          throw {
            code: 'network_error',
            message: 'Mock sign-out failure.',
          };
        }
        isAuthenticated = false;
      },
      async getAccessToken() {
        if (mockOptions.failGetAccessToken) {
          throw {
            code: mockOptions.getAccessTokenErrorCode ?? 'interaction_required',
            message: 'Mock token acquisition failure.',
          };
        }

        return 'mock-access-token';
      },
    };
  }, options);
};

export const installMockGraphClient = async (
  page: Page,
  options: MockGraphClientOptions = {},
): Promise<void> => {
  await page.addInitScript((mockOptions: MockGraphClientOptions) => {
    let listChildrenCallCount = 0;
    let resolveFileByPathCallCount = 0;
    let getFileMetadataCallCount = 0;
    let downloadFileCallCount = 0;
    let uploadFileCallCount = 0;
    const metadataETagSequence = [...(mockOptions.metadataETagSequence ?? [])];
    const metadataErrorSequence = [...(mockOptions.metadataErrorSequence ?? [])];
    const downloadErrorSequence = [...(mockOptions.downloadErrorSequence ?? [])];
    const uploadErrorSequence = [...(mockOptions.uploadErrorSequence ?? [])];
    const defaultDownloadBytes = mockOptions.downloadBytes ?? [
      83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0, 1, 2, 3, 4,
    ];
    const rootItems = [
      {
        driveId: 'drive-123',
        itemId: 'folder-finance',
        name: 'Finance',
        parentPath: '/',
        kind: 'folder',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-root-db',
        name: 'conspectus.db',
        parentPath: '/',
        kind: 'file',
      },
      {
        driveId: 'drive-123',
        itemId: 'file-root-text',
        name: 'notes.txt',
        parentPath: '/',
        kind: 'file',
      },
      ...(mockOptions.includeMalformedDbFile
        ? [
            {
              driveId: '',
              itemId: 'file-malformed-db',
              name: 'malformed.db',
              parentPath: '/',
              kind: 'file' as const,
            },
          ]
        : []),
      ...Array.from({ length: mockOptions.extraRootDbFileCount ?? 0 }, (_, index) => ({
        driveId: 'drive-123',
        itemId: `file-extra-db-${index + 1}`,
        name: `extra-${String(index + 1).padStart(2, '0')}.db`,
        parentPath: '/',
        kind: 'file' as const,
      })),
    ];

    const financeItems = [
      {
        driveId: 'drive-123',
        itemId: 'file-finance-db',
        name: 'budget.db',
        parentPath: '/Finance',
        kind: 'file',
      },
    ];

    (window as Window & { __CONSPECTUS_GRAPH_CLIENT__?: unknown }).__CONSPECTUS_GRAPH_CLIENT__ = {
      async listChildren(folder?: { itemId?: string }) {
        listChildrenCallCount += 1;
        (
          window as Window & { __CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__?: number }
        ).__CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__ = listChildrenCallCount;
        if (mockOptions.failListChildren) {
          throw {
            code: 'network_error',
            message: 'Mock OneDrive browse failure.',
          };
        }

        if (
          typeof mockOptions.listChildrenDelayMs === 'number' &&
          mockOptions.listChildrenDelayMs > 0
        ) {
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.listChildrenDelayMs);
          });
        }

        if (folder?.itemId === 'folder-finance') {
          return financeItems;
        }

        return rootItems;
      },
      async resolveFileByPath(binding: {
        driveId: string;
        itemId: string;
        name: string;
        parentPath: string;
      }) {
        resolveFileByPathCallCount += 1;
        (
          window as Window & { __CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__?: number }
        ).__CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__ = resolveFileByPathCallCount;

        if (mockOptions.resolvePathError !== undefined) {
          throw mockOptions.resolvePathError;
        }

        return (
          mockOptions.resolvedPathBinding ?? {
            ...binding,
            itemId: 'recovered-file-id',
          }
        );
      },
      async getFileMetadata() {
        getFileMetadataCallCount += 1;
        (
          window as Window & { __CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__?: number }
        ).__CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__ = getFileMetadataCallCount;
        const nextMetadataError = metadataErrorSequence.shift();
        if (nextMetadataError !== undefined) {
          throw nextMetadataError;
        }
        if (mockOptions.failGetFileMetadata) {
          throw {
            code: 'network_error',
            message: 'Mock metadata fetch failure.',
          };
        }

        if (typeof mockOptions.metadataDelayMs === 'number' && mockOptions.metadataDelayMs > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.metadataDelayMs);
          });
        }

        return {
          eTag: metadataETagSequence.shift() ?? mockOptions.metadataETag ?? '"etag-1"',
          sizeBytes: defaultDownloadBytes.length,
          lastModifiedDateTime: mockOptions.metadataLastModifiedDateTime ?? '2026-03-09T10:15:00Z',
        };
      },
      async getFileDownloadUrl() {
        return 'https://download.example.com/conspectus.db';
      },
      async downloadFile(
        _downloadUrl: string,
        onProgress?: (loaded: number, total: number | null) => void,
      ) {
        downloadFileCallCount += 1;
        (
          window as Window & { __CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__?: number }
        ).__CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__ = downloadFileCallCount;
        const nextDownloadError = downloadErrorSequence.shift();
        if (nextDownloadError !== undefined) {
          throw nextDownloadError;
        }
        if (mockOptions.failDownloadFile) {
          throw {
            code: 'network_error',
            message: 'Mock snapshot download failure.',
          };
        }

        if (typeof mockOptions.downloadDelayMs === 'number' && mockOptions.downloadDelayMs > 0) {
          if (onProgress) {
            const total = defaultDownloadBytes.length;
            const half = Math.floor(total / 2);
            onProgress(half, total);
            await new Promise((resolve) => {
              setTimeout(resolve, mockOptions.downloadDelayMs / 2);
            });
            onProgress(total, total);
            await new Promise((resolve) => {
              setTimeout(resolve, mockOptions.downloadDelayMs / 2);
            });
          } else {
            await new Promise((resolve) => {
              setTimeout(resolve, mockOptions.downloadDelayMs);
            });
          }
        }

        return new Uint8Array(defaultDownloadBytes);
      },
      async uploadFile(
        _binding: unknown,
        bytes: Uint8Array,
        _eTag: string,
        onProgress?: (loaded: number, total: number | null) => void,
      ) {
        uploadFileCallCount += 1;
        (
          window as Window & { __CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__?: number }
        ).__CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__ = uploadFileCallCount;

        if (uploadErrorSequence.length > 0) {
          const error = uploadErrorSequence.shift();
          if (error !== undefined) {
            throw {
              code: error.code,
              message: error.message ?? 'Mock upload failure.',
            };
          }
        }

        if (onProgress) {
          const total = bytes.length;
          const half = Math.floor(total / 2);
          onProgress(half, total);
          // Small delay for progress visibility in E2E
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.uploadDelayMs ? mockOptions.uploadDelayMs / 2 : 500);
          });
          onProgress(total, total);
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.uploadDelayMs ? mockOptions.uploadDelayMs / 2 : 500);
          });
        } else if (mockOptions.uploadDelayMs) {
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.uploadDelayMs);
          });
        }

        return {
          eTag: '"etag-2"',
          sizeBytes: bytes.length,
          lastModifiedDateTime: '2026-03-09T11:15:00Z',
        };
      },
    };
    (
      window as Window & { __CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__ = listChildrenCallCount;
    (
      window as Window & { __CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__ = resolveFileByPathCallCount;
    (
      window as Window & { __CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__ = getFileMetadataCallCount;
    (
      window as Window & { __CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__ = downloadFileCallCount;
    (
      window as Window & { __CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__ = uploadFileCallCount;
  }, options);
};

export const installMockCacheStore = async (
  page: Page,
  options: MockCacheStoreOptions = {},
): Promise<void> => {
  await page.addInitScript((mockOptions: MockCacheStoreOptions) => {
    let clearAllCallCount = 0;
    let readSnapshotCallCount = 0;
    const toBindingKey = (binding: { driveId: string; itemId: string }): string =>
      `${binding.driveId}::${binding.itemId}`;
    const cloneSnapshot = (snapshot: {
      binding: {
        driveId: string;
        itemId: string;
        name: string;
        parentPath: string;
      };
      metadata: {
        eTag: string;
        lastSyncAtIso: string;
      };
      dbBytes: readonly number[];
    }) => ({
      binding: { ...snapshot.binding },
      metadata: { ...snapshot.metadata },
      dbBytes: new Uint8Array(snapshot.dbBytes),
    });

    const storedSnapshots = new Map<
      string,
      {
        binding: {
          driveId: string;
          itemId: string;
          name: string;
          parentPath: string;
        };
        metadata: {
          eTag: string;
          lastSyncAtIso: string;
        };
        dbBytes: readonly number[];
      }
    >();
    const initialSnapshot = mockOptions.startupSnapshot;
    if (initialSnapshot !== null && initialSnapshot !== undefined) {
      const snapshot = {
        binding: {
          driveId: initialSnapshot.binding?.driveId ?? 'drive-123',
          itemId: initialSnapshot.binding?.itemId ?? 'file-root-db',
          name: initialSnapshot.binding?.name ?? 'conspectus.db',
          parentPath: initialSnapshot.binding?.parentPath ?? '/',
        },
        metadata: {
          eTag: initialSnapshot.metadata?.eTag ?? '"etag-1"',
          lastSyncAtIso: initialSnapshot.metadata?.lastSyncAtIso ?? '2026-03-11T09:45:00.000Z',
        },
        dbBytes: initialSnapshot.dbBytes ?? [
          83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0, 9, 8, 7, 6,
        ],
      };
      storedSnapshots.set(toBindingKey(snapshot.binding), snapshot);
    }

    const mockCacheStore = {
      async readSnapshot(binding: { driveId: string; itemId: string }) {
        readSnapshotCallCount += 1;
        (
          window as Window & { __CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__?: number }
        ).__CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__ = readSnapshotCallCount;
        const snapshot = storedSnapshots.get(toBindingKey(binding));
        return snapshot ? cloneSnapshot(snapshot) : null;
      },
      async writeSnapshot(snapshot: {
        binding: {
          driveId: string;
          itemId: string;
          name: string;
          parentPath: string;
        };
        metadata: {
          eTag: string;
          lastSyncAtIso: string;
        };
        dbBytes: Uint8Array;
      }) {
        (
          window as Window & { __CONSPECTUS_LAST_WRITTEN_SYNC_AT__?: string }
        ).__CONSPECTUS_LAST_WRITTEN_SYNC_AT__ = snapshot.metadata.lastSyncAtIso;
        storedSnapshots.set(toBindingKey(snapshot.binding), {
          binding: { ...snapshot.binding },
          metadata: { ...snapshot.metadata },
          dbBytes: Array.from(snapshot.dbBytes),
        });
      },
      async clearSnapshot(binding: { driveId: string; itemId: string }) {
        storedSnapshots.delete(toBindingKey(binding));
      },
      async clearAll() {
        clearAllCallCount += 1;
        (
          window as Window & { __CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__?: number }
        ).__CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__ = clearAllCallCount;

        if (typeof mockOptions.clearAllDelayMs === 'number' && mockOptions.clearAllDelayMs > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.clearAllDelayMs);
          });
        }

        if (mockOptions.failClearAll) {
          throw new Error('Mock cache clear failure.');
        }
        storedSnapshots.clear();
      },
    };

    (window as Window & { __CONSPECTUS_CACHE_STORE__?: unknown }).__CONSPECTUS_CACHE_STORE__ =
      mockCacheStore;
    (
      window as Window & { __CONSPECTUS_APP_CACHE_STORE__?: unknown }
    ).__CONSPECTUS_APP_CACHE_STORE__ = mockCacheStore;
    (
      window as Window & { __CONSPECTUS_APP_SNAPSHOT_VALIDATOR__?: unknown }
    ).__CONSPECTUS_APP_SNAPSHOT_VALIDATOR__ = {
      async validate() {
        return undefined;
      },
    };

    (
      window as Window & { __CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__?: number }
    ).__CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__ = clearAllCallCount;
    (
      window as Window & { __CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__?: number }
    ).__CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__ = readSnapshotCallCount;
  }, options);
};

export const installMockDbRuntime = async (
  page: Page,
  options: MockDbRuntimeOptions = {},
): Promise<void> => {
  await page.addInitScript((mockOptions: MockDbRuntimeOptions) => {
    const accountRows = [...(mockOptions.accountRows ?? [])];
    const fromAccountOptionRows = mockOptions.fromAccountOptionRows ?? accountRows;
    const toAccountOptionRows = mockOptions.toAccountOptionRows ?? accountRows;
    const categoryRows = mockOptions.categoryRows ?? [];
    const transferRows = [...(mockOptions.transferRows ?? [])];
    let nextTransferId = Math.max(998, ...transferRows.map((transfer) => transfer.transferId)) + 1;
    let isOpen = mockOptions.forceAlwaysOpen ?? false;
    let execCallCount = 0;
    let openCallCount = 0;
    let closeCallCount = 0;
    let localTransferWriteCallCount = 0;
    const isAccountsQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return (
        normalizedSql.includes('from account') &&
        normalizedSql.includes('where visible = 1') &&
        normalizedSql.includes('ac_type_id not in (1, 2)')
      );
    };
    const isAddTransferFromOptionsQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return (
        normalizedSql.includes('from account') &&
        normalizedSql.includes('ac_type_id = 1') &&
        normalizedSql.includes('case when ac_type_id = 1')
      );
    };
    const isAddTransferToOptionsQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return (
        normalizedSql.includes('from account') &&
        normalizedSql.includes('ac_type_id = 2') &&
        normalizedSql.includes('case when ac_type_id = 2')
      );
    };
    const isCategoriesQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return (
        normalizedSql.includes('from category') &&
        normalizedSql.includes('order by lower(name) asc')
      );
    };
    const isAllAccountsQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return (
        normalizedSql.includes('from account') && normalizedSql.includes('order by account_id asc')
      );
    };
    const isTransfersByMonthQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return normalizedSql.includes('from transfer') && normalizedSql.includes('where date >= ?');
    };
    const toAccountQueryResult = (rows: readonly MockDbRuntimeAccountRow[]) => [
      {
        columns: ['account_id', 'name', 'amount', 'ac_type_id'],
        values: rows.map((account) => [
          account.accountId,
          account.name,
          account.amountCents,
          account.accountTypeId ?? null,
        ]),
      },
    ];

    (window as Window & { __CONSPECTUS_APP_DB_RUNTIME__?: unknown }).__CONSPECTUS_APP_DB_RUNTIME__ =
      {
        async open() {
          openCallCount += 1;
          (
            window as Window & { __CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__?: number }
          ).__CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__ = openCallCount;
          isOpen = true;
        },
        close() {
          closeCallCount += 1;
          (
            window as Window & { __CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__?: number }
          ).__CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__ = closeCallCount;
          if (mockOptions.forceAlwaysOpen) {
            return;
          }
          isOpen = false;
        },
        isOpen() {
          return isOpen;
        },
        exec(sql: string, params: readonly (string | number | null)[] = []) {
          execCallCount += 1;
          (
            window as Window & { __CONSPECTUS_DB_RUNTIME_EXEC_CALL_COUNT__?: number }
          ).__CONSPECTUS_DB_RUNTIME_EXEC_CALL_COUNT__ = execCallCount;

          if (!isOpen) {
            throw {
              code: 'db_not_open',
              message: 'SQLite runtime is not open yet.',
            };
          }

          if (sql.toLowerCase().includes('begin immediate transaction')) {
            localTransferWriteCallCount += 1;
            (
              window as Window & { __CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__?: number }
            ).__CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__ = localTransferWriteCallCount;
          }

          if (isAddTransferFromOptionsQuery(sql)) {
            return toAccountQueryResult(fromAccountOptionRows);
          }

          if (isAddTransferToOptionsQuery(sql)) {
            return toAccountQueryResult(toAccountOptionRows);
          }

          if (isAccountsQuery(sql)) {
            if (mockOptions.failAccountsQuery) {
              throw {
                code: mockOptions.accountsQueryErrorCode ?? 'db_query_failed',
                message: mockOptions.accountsQueryErrorMessage ?? 'Mock accounts query failed.',
              };
            }

            return toAccountQueryResult(accountRows);
          }

          if (isAllAccountsQuery(sql)) {
            return toAccountQueryResult(accountRows);
          }

          if (isCategoriesQuery(sql)) {
            return [
              {
                columns: ['category_id', 'name'],
                values: categoryRows.map((category) => [category.categoryId, category.name]),
              },
            ];
          }

          if (isTransfersByMonthQuery(sql)) {
            const startEpochDay = params[0];
            const endEpochDay = params[1];
            return [
              {
                columns: [
                  'transfer_id',
                  'date',
                  'name',
                  'amount',
                  'from_account',
                  'to_account',
                  'category_1_id',
                  'category_2_id',
                  'category_3_id',
                  'buyplace',
                ],
                values: transferRows
                  .filter(
                    (transfer) =>
                      typeof startEpochDay === 'number' &&
                      typeof endEpochDay === 'number' &&
                      transfer.bookingDateEpochDay >= startEpochDay &&
                      transfer.bookingDateEpochDay <= endEpochDay,
                  )
                  .map((transfer) => [
                    transfer.transferId,
                    transfer.bookingDateEpochDay,
                    transfer.name,
                    transfer.amountCents,
                    transfer.fromAccountId,
                    transfer.toAccountId,
                    transfer.categoryIds[0] ?? null,
                    transfer.categoryIds[1] ?? null,
                    transfer.categoryIds[2] ?? null,
                    transfer.buyplace,
                  ]),
              },
            ];
          }

          if (sql.toLowerCase().includes('insert into transfer')) {
            transferRows.push({
              transferId: nextTransferId,
              name: String(params[0]),
              fromAccountId: Number(params[1]),
              toAccountId: Number(params[2]),
              amountCents: Number(params[3]),
              categoryIds: [
                params[5] as number | null,
                params[6] as number | null,
                params[7] as number | null,
              ],
              bookingDateEpochDay: Number(params[8]),
              buyplace: params[9] as string | null,
            });
            return [];
          }

          if (sql.toLowerCase().includes('last_insert_rowid()')) {
            return [{ columns: ['transfer_id'], values: [[nextTransferId++]] }];
          }

          if (sql.toLowerCase().includes('update account set amount = amount - ?')) {
            const account = accountRows.find((candidate) => candidate.accountId === params[1]);
            if (account !== undefined) {
              account.amountCents -= Number(params[0]);
            }
            return [];
          }

          if (sql.toLowerCase().includes('update account set amount = amount + ?')) {
            const account = accountRows.find((candidate) => candidate.accountId === params[1]);
            if (account !== undefined) {
              account.amountCents += Number(params[0]);
            }
            return [];
          }

          return [];
        },
        exportBytes() {
          return new Uint8Array([
            0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20,
            0x33, 0x00, 4, 3, 2, 1,
          ]);
        },
      };

    (
      window as Window & { __CONSPECTUS_APP_SNAPSHOT_VALIDATOR__?: unknown }
    ).__CONSPECTUS_APP_SNAPSHOT_VALIDATOR__ = {
      async validate() {
        return undefined;
      },
    };

    (
      window as Window & { __CONSPECTUS_DB_RUNTIME_EXEC_CALL_COUNT__?: number }
    ).__CONSPECTUS_DB_RUNTIME_EXEC_CALL_COUNT__ = execCallCount;
    (
      window as Window & { __CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__?: number }
    ).__CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__ = openCallCount;
    (
      window as Window & { __CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__?: number }
    ).__CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__ = closeCallCount;
    (
      window as Window & { __CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__?: number }
    ).__CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__ = localTransferWriteCallCount;
  }, options);
};

export const installPersistedBinding = async (
  page: Page,
  binding: {
    readonly driveId: string;
    readonly itemId: string;
    readonly name: string;
    readonly parentPath: string;
  } = {
    driveId: 'drive-123',
    itemId: 'file-root-db',
    name: 'conspectus.db',
    parentPath: '/',
  },
): Promise<void> => {
  await page.addInitScript(
    (persistedBinding: { driveId: string; itemId: string; name: string; parentPath: string }) => {
      window.localStorage.setItem(
        'conspectus.selectedDriveItemBinding',
        JSON.stringify({
          version: 2,
          bindingsByAccountId: {
            'mock-home-account': persistedBinding,
          },
        }),
      );
    },
    binding,
  );
};

export const installReadyAddTransferTestDb = async (
  page: Page,
  dbRuntimeOptions: MockDbRuntimeOptions = {},
  graphOptions: MockGraphClientOptions = {},
): Promise<void> => {
  await installPersistedBinding(page);
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    ...dbRuntimeOptions,
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: { eTag: 'existing-etag', lastSyncAtIso: new Date().toISOString() },
      dbBytes: createSqliteBytes([1, 2, 3]),
    },
  });
  await installMockGraphClient(page, graphOptions);
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
};

export const installMockStartupNetworkState = async (
  page: Page,
  isOnline: boolean,
): Promise<void> => {
  await page.addInitScript((nextIsOnline: boolean) => {
    (
      window as Window & { __CONSPECTUS_APP_STARTUP_IS_ONLINE__?: boolean }
    ).__CONSPECTUS_APP_STARTUP_IS_ONLINE__ = nextIsOnline;
  }, isOnline);
};

export const getGraphListChildrenCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getGraphMetadataCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getGraphResolvePathCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getGraphDownloadCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getGraphUploadCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getLocalTransferWriteCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getCacheClearAllCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getCacheReadSnapshotCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getDbRuntimeOpenCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

export const getDbRuntimeCloseCallCount = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });
