// Covers the app-shell navigation, auth mock flow, and OneDrive file selection behavior in a browser.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.use({ viewport: { width: 390, height: 844 } });

const resolveAppBasePath = (): string => {
  const configuredBasePath = process.env.PLAYWRIGHT_APP_BASE_PATH?.trim();
  if (!configuredBasePath) {
    return '/conspectus/webapp/';
  }

  const withLeadingSlash = configuredBasePath.startsWith('/')
    ? configuredBasePath
    : `/${configuredBasePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const APP_BASE_PATH = resolveAppBasePath();
const APP_BASE_PATH_WITHOUT_TRAILING_SLASH = APP_BASE_PATH.slice(0, -1);
const RUNTIME_CLIENT_ID_PATTERN = /VITE_AZURE_CLIENT_ID:"[^"]*"/g;
const appPath = (suffix = ''): string => `${APP_BASE_PATH}${suffix}`;
const SQLITE_DATABASE_HEADER_BYTES = [
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
];
const createSqliteBytes = (payloadBytes: readonly number[] = [1, 2, 3, 4]): number[] => [
  ...SQLITE_DATABASE_HEADER_BYTES,
  ...payloadBytes,
];
const createMockGraphError = (
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
const REQUIRED_MANIFEST_ICONS = [
  {
    src: 'icons/moneysack192x192.png',
    sizes: '192x192',
  },
  {
    src: 'icons/moneysack512x512.png',
    sizes: '512x512',
  },
];

const resolveCurrentMonthKey = async (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

const dispatchTransferMonthSwipe = async (
  page: import('@playwright/test').Page,
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

const inspectTransferMonthSwipeMove = async (
  page: import('@playwright/test').Page,
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

type MockAuthClientOptions = {
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

type MockGraphError = {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
};

type MockGraphClientOptions = {
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

type MockStartupSnapshot = {
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

type MockCacheStoreOptions = {
  readonly failClearAll?: boolean;
  readonly clearAllDelayMs?: number;
  readonly startupSnapshot?: MockStartupSnapshot | null;
};

type MockDbRuntimeAccountRow = {
  accountId: number;
  name: string;
  amountCents: number;
  accountTypeId?: number | null;
};

type MockDbRuntimeTransferRow = {
  readonly transferId: number;
  readonly bookingDateEpochDay: number;
  readonly name: string;
  readonly amountCents: number;
  readonly fromAccountId: number;
  readonly toAccountId: number;
  readonly categoryIds: readonly (number | null)[];
  readonly buyplace: string | null;
};

type MockDbRuntimeOptions = {
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

const installMockAuthClient = async (
  page: import('@playwright/test').Page,
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

const installMockGraphClient = async (
  page: import('@playwright/test').Page,
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

const installMockCacheStore = async (
  page: import('@playwright/test').Page,
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

const installMockDbRuntime = async (
  page: import('@playwright/test').Page,
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

const installPersistedBinding = async (
  page: import('@playwright/test').Page,
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

const installReadyAddTransferTestDb = async (
  page: import('@playwright/test').Page,
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

const installMockStartupNetworkState = async (
  page: import('@playwright/test').Page,
  isOnline: boolean,
): Promise<void> => {
  await page.addInitScript((nextIsOnline: boolean) => {
    (
      window as Window & { __CONSPECTUS_APP_STARTUP_IS_ONLINE__?: boolean }
    ).__CONSPECTUS_APP_STARTUP_IS_ONLINE__ = nextIsOnline;
  }, isOnline);
};

const getGraphListChildrenCallCount = async (
  page: import('@playwright/test').Page,
): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getGraphMetadataCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getGraphResolvePathCallCount = async (
  page: import('@playwright/test').Page,
): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_RESOLVE_PATH_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getGraphDownloadCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getGraphUploadCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_UPLOAD_FILE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getLocalTransferWriteCallCount = async (
  page: import('@playwright/test').Page,
): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_LOCAL_TRANSFER_WRITE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getCacheClearAllCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_CACHE_CLEAR_ALL_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getCacheReadSnapshotCallCount = async (
  page: import('@playwright/test').Page,
): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_CACHE_READ_SNAPSHOT_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getDbRuntimeOpenCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_DB_RUNTIME_OPEN_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

const getDbRuntimeCloseCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_DB_RUNTIME_CLOSE_CALL_COUNT__;
    return typeof value === 'number' ? value : 0;
  });

test('shows startup configuration error when required runtime env is missing', async ({ page }) => {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();

    const rewrittenBody = body.replace(RUNTIME_CLIENT_ID_PATTERN, 'VITE_AZURE_CLIENT_ID:"   "');
    if (rewrittenBody === body) {
      await route.fulfill({ response, body });
      return;
    }

    await route.fulfill({
      response,
      body: rewrittenBody,
    });
  });

  await page.goto(appPath());

  await expect(
    page.getByRole('heading', { level: 1, name: 'Startup configuration error' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'Missing required environment variable(s): VITE_AZURE_CLIENT_ID.',
  );
  await expect(page.getByTestId('app-shell')).toHaveCount(0);
});

test('loads a mobile app shell and navigates primary routes', async ({ page }) => {
  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByTestId('app-nav-icon-accounts')).toHaveAttribute(
    'src',
    appPath('icons/account_55.png'),
  );
  await expect(page.getByTestId('app-nav-icon-transfers')).toHaveAttribute(
    'src',
    appPath('icons/standingorder_55.png'),
  );
  await expect(page.getByTestId('app-nav-icon-add')).toHaveAttribute(
    'src',
    appPath('icons/category_55.png'),
  );
  await expect(page.getByTestId('app-nav-icon-settings')).toHaveAttribute(
    'src',
    appPath('icons/settings_55.png'),
  );
  await expect(page.getByTestId('app-shell-bottom')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page).toHaveURL(/#\/transfers$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();

  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page).toHaveURL(/#\/add$/);
  await expect(page.getByTestId('add-transfer-database-required')).toContainText(
    'Choose a database first.',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
});

test('renders an editable add transfer bottom sheet on mobile viewports', async ({ page }) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    categoryRows: [{ categoryId: 20, name: 'Groceries' }],
  });

  await page.goto(appPath('#/add'));

  await expect(page.getByTestId('route-add')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'New Transfer' })).toBeVisible();
  await expect(page.getByTestId('add-transfer-form')).toBeVisible();

  const editableControls = [
    'add-transfer-date',
    'add-transfer-name',
    'add-transfer-amount',
    'add-transfer-from-account',
    'add-transfer-to-account',
    'add-transfer-category-1',
    'add-transfer-category-2',
    'add-transfer-category-3',
    'add-transfer-buyplace',
  ];

  for (const testId of editableControls) {
    const control = page.getByTestId(testId);
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    await expect(control).toHaveClass(/app-input/);
  }

  await page.getByTestId('add-transfer-date').fill('2024-04-15');
  await page.getByTestId('add-transfer-name').fill('Groceries');
  const amountInput = page.getByTestId('add-transfer-amount');
  await amountInput.pressSequentially('1');
  await expect(amountInput).toHaveValue('0,01€');
  await amountInput.pressSequentially('2');
  await expect(amountInput).toHaveValue('0,12€');
  await amountInput.pressSequentially('3');
  await expect(amountInput).toHaveValue('1,23€');
  await amountInput.pressSequentially('4');
  await expect(amountInput).toHaveValue('12,34€');
  await page.getByTestId('add-transfer-buyplace').fill('Supermarket');

  const submitButton = page.getByTestId('add-transfer-submit');
  await expect(submitButton).toBeEnabled();
  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  await submitButton.scrollIntoViewIfNeeded();
  await expect(submitButton).toBeInViewport();
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('12,34€');
  await expect(page.getByTestId('add-transfer-buyplace')).toHaveValue('Supermarket');
});

test('keeps add transfer form controls aligned on mobile and desktop viewports', async ({
  page,
}) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 12, name: 'Savings', amountCents: 5000, accountTypeId: 3 },
    ],
  });

  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  const mobileControlMetrics = await page.evaluate(() => {
    const dateInput = document.querySelector('[data-testid="add-transfer-date"]') as HTMLElement;
    const nameInput = document.querySelector('[data-testid="add-transfer-name"]') as HTMLElement;
    const route = document.querySelector('[data-testid="route-add"]') as HTMLElement;
    const dateBox = dateInput.getBoundingClientRect();
    const nameBox = nameInput.getBoundingClientRect();
    return {
      dateWidth: dateBox.width,
      dateHeight: dateBox.height,
      nameWidth: nameBox.width,
      nameHeight: nameBox.height,
      hasHorizontalOverflow: route.scrollWidth > route.clientWidth + 1,
    };
  });

  expect(mobileControlMetrics.dateWidth).toBeLessThanOrEqual(mobileControlMetrics.nameWidth + 1);
  expect(
    Math.abs(mobileControlMetrics.dateHeight - mobileControlMetrics.nameHeight),
  ).toBeLessThanOrEqual(2);
  expect(mobileControlMetrics.hasHorizontalOverflow).toBe(false);

  await page.setViewportSize({ width: 1024, height: 900 });
  const desktopSelectStyle = await page
    .getByTestId('add-transfer-from-account')
    .evaluate((select) => {
      const styles = getComputedStyle(select);
      return {
        matchesDesktopPointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
        appearance: styles.appearance,
        paddingRight: Number.parseFloat(styles.paddingRight),
        backgroundImage: styles.backgroundImage,
      };
    });

  if (desktopSelectStyle.matchesDesktopPointer) {
    expect(desktopSelectStyle.appearance).toBe('none');
    expect(desktopSelectStyle.paddingRight).toBeGreaterThan(40);
    expect(desktopSelectStyle.backgroundImage).not.toBe('none');
  }
});

test('keeps add transfer draft values after closing and reopening the sheet', async ({ page }) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 12, name: 'Savings', amountCents: 5000, accountTypeId: 3 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Groceries' },
      { categoryId: 30, name: 'Travel' },
      { categoryId: 40, name: 'Rent' },
    ],
  });

  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-form')).toBeVisible();

  await page.getByTestId('add-transfer-date').fill('2024-04-15');
  await page.getByTestId('add-transfer-name').fill('Draft Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1234');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Checking' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Savings' });
  await page.getByTestId('add-transfer-category-1').selectOption({ label: 'Groceries' });
  await page.getByTestId('add-transfer-category-2').selectOption({ label: 'Travel' });
  await page.getByTestId('add-transfer-category-3').selectOption({ label: 'Rent' });
  await page.getByTestId('add-transfer-buyplace').fill('Supermarket');

  await page.getByTestId('add-transfer-close').click();
  await expect(page).toHaveURL(/#\/transfers$/);

  await page.getByRole('link', { name: 'Add' }).click();
  await expect(page).toHaveURL(/#\/add$/);
  await expect(page.getByTestId('add-transfer-form')).toBeVisible();
  await expect(page.getByTestId('add-transfer-date')).toHaveValue('2024-04-15');
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Draft Transfer');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('12,34€');
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('11');
  await expect(page.getByTestId('add-transfer-to-account')).toHaveValue('12');
  await expect(page.getByTestId('add-transfer-category-1')).toHaveValue('20');
  await expect(page.getByTestId('add-transfer-category-2')).toHaveValue('30');
  await expect(page.getByTestId('add-transfer-category-3')).toHaveValue('40');
  await expect(page.getByTestId('add-transfer-buyplace')).toHaveValue('Supermarket');
});

test('loads add transfer account and category options from the local DB runtime', async ({
  page,
}) => {
  await installReadyAddTransferTestDb(page, {
    fromAccountOptionRows: [
      { accountId: 1, name: 'Primary Income', amountCents: 0, accountTypeId: 1 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      { accountId: 12, name: 'Wallet', amountCents: 500, accountTypeId: 3 },
    ],
    toAccountOptionRows: [
      { accountId: 2, name: 'Primary Spendings', amountCents: 0, accountTypeId: 2 },
      { accountId: 11, name: 'Checking', amountCents: 1000, accountTypeId: 3 },
      { accountId: 12, name: 'Wallet', amountCents: 500, accountTypeId: 3 },
    ],
    categoryRows: [
      { categoryId: 20, name: 'Groceries' },
      { categoryId: 30, name: 'Rent' },
      { categoryId: 40, name: 'Travel' },
    ],
  });

  await page.goto(appPath('#/add'));

  const fromAccountOptions = page.getByTestId('add-transfer-from-account').locator('option');
  await expect(fromAccountOptions).toHaveText([
    'Select source account',
    'INCOME',
    'Checking',
    'Wallet',
  ]);

  const toAccountOptions = page.getByTestId('add-transfer-to-account').locator('option');
  await expect(toAccountOptions).toHaveText([
    'Select destination account',
    'SPENDINGS',
    'Checking',
    'Wallet',
  ]);

  for (const testId of [
    'add-transfer-category-1',
    'add-transfer-category-2',
    'add-transfer-category-3',
  ]) {
    await expect(page.getByTestId(testId).locator('option')).toHaveText([
      'No category',
      'Groceries',
      'Rent',
      'Travel',
    ]);
  }
});

test('renders readable account cards with semantic amount styling on narrow mobile widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    accountRows: [
      {
        accountId: 101,
        name: 'Main Household Spending Account with Long Name',
        amountCents: 1234567,
      },
      {
        accountId: 102,
        name: 'Long-Term Loan',
        amountCents: -499900,
      },
      {
        accountId: 103,
        name: 'Settled Offset',
        amountCents: 0,
      },
    ],
  });

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-cards')).toBeVisible();
  await expect(page.getByText('Main Household Spending Account with Long Name')).toBeVisible();
  await expect(page.getByTestId('account-amount-positive-101')).toHaveText('+€12,345.67');
  await expect(page.getByTestId('account-amount-negative-102')).toHaveText('-€4,999.00');
  await expect(page.getByTestId('account-amount-neutral-103')).toHaveText('€0.00');

  const hasHorizontalOverflow = await page.getByTestId('route-accounts').evaluate((element) => {
    return element.scrollWidth > element.clientWidth + 1;
  });
  expect(hasHorizontalOverflow).toBe(false);

  const amountColors = await page.evaluate(() => {
    const positive = getComputedStyle(
      document.querySelector('[data-testid="account-amount-positive-101"]') as HTMLElement,
    ).color;
    const negative = getComputedStyle(
      document.querySelector('[data-testid="account-amount-negative-102"]') as HTMLElement,
    ).color;
    const neutral = getComputedStyle(
      document.querySelector('[data-testid="account-amount-neutral-103"]') as HTMLElement,
    ).color;
    return { positive, negative, neutral };
  });

  expect(amountColors.positive).not.toBe(amountColors.negative);
  expect(amountColors.neutral).not.toBe(amountColors.negative);
});

test('shows accounts empty state when no visible non-primary accounts are returned', async ({
  page,
}) => {
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    accountRows: [],
  });

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-empty')).toBeVisible();
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
});

test('shows accounts error state on query failure without breaking bottom navigation', async ({
  page,
}) => {
  await installMockDbRuntime(page, {
    forceAlwaysOpen: true,
    failAccountsQuery: true,
    accountsQueryErrorMessage: 'Mock accounts query failure.',
  });

  await page.goto(appPath('#/accounts'));

  await expect(page.getByRole('alert')).toContainText(
    'Failed to load visible non-primary accounts from the local SQLite database.',
  );
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('switches transfer months by buttons and swipe gestures', async ({ page }) => {
  await page.goto(appPath('#/transfers'));

  const monthLabel = page.getByTestId('transfers-month-label');
  const expectedInitialMonthKey = await resolveCurrentMonthKey(page);
  await expect(monthLabel).toBeVisible();
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await page.getByTestId('transfers-month-next-button').click();
  await expect(monthLabel).toHaveAttribute('data-month-key', /^\d{4}-\d{2}$/);
  const monthAfterNextButton = await monthLabel.getAttribute('data-month-key');
  expect(monthAfterNextButton).not.toBeNull();
  expect(monthAfterNextButton).not.toBe(expectedInitialMonthKey);

  await page.getByTestId('transfers-month-previous-button').click();
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, -120, 8);
  const monthAfterLeftSwipe = await monthLabel.getAttribute('data-month-key');
  expect(monthAfterLeftSwipe).not.toBeNull();
  expect(monthAfterLeftSwipe).not.toBe(expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, 120, 10);
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, -24, 4);
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);

  await dispatchTransferMonthSwipe(page, 30, 120);
  await expect(monthLabel).toHaveAttribute('data-month-key', expectedInitialMonthKey);
});

test('shows transfer swipe drag feedback and locks horizontal drag scroll', async ({ page }) => {
  await page.goto(appPath('#/transfers'));

  const horizontalMove = await inspectTransferMonthSwipeMove(page, -80, 6);
  expect(horizontalMove.defaultPrevented).toBe(true);
  expect(horizontalMove.trackTransform).toBe('translateX(-28px)');

  const verticalMove = await inspectTransferMonthSwipeMove(page, 8, 80);
  expect(verticalMove.defaultPrevented).toBe(false);
  expect(verticalMove.trackTransform).toBe('translateX(0px)');
});

test('reuses the cached DB on startup when the OneDrive eTag is unchanged', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-1"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('force refresh downloads an unchanged DB and reports progress plus the new sync timestamp', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-1"',
    downloadDelayMs: 1_200,
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
        lastSyncAtIso: '2026-03-11T09:45:00.000Z',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await installMockDbRuntime(page, { forceAlwaysOpen: true });

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('force-refresh-button')).toBeEnabled();
  const initialLastSync = await page.getByTestId('settings-last-sync').textContent();
  const metadataCallsBeforeRefresh = await getGraphMetadataCallCount(page);

  await page.getByTestId('force-refresh-button').click();

  await expect(page.getByTestId('force-refresh-button')).toBeDisabled();
  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.getByTestId('force-refresh-status')).toContainText(
    'Checking OneDrive for DB updates...',
  );
  await expect(page.getByTestId('force-refresh-status')).toContainText(
    'Downloaded the latest DB from OneDrive.',
  );
  await expect(page.getByTestId('force-refresh-button')).toBeEnabled();

  const refreshedLastSync = await page.getByTestId('settings-last-sync').textContent();
  expect(refreshedLastSync).not.toBe(initialLastSync);
  expect(await getGraphMetadataCallCount(page)).toBe(metadataCallsBeforeRefresh + 1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('force refresh reports an offline failure and remains retryable', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([7, 7, 7, 7]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/settings'));

  const refreshButton = page.getByTestId('force-refresh-button');
  await expect(refreshButton).toBeEnabled();
  await refreshButton.click();

  await expect(page.getByTestId('force-refresh-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('force-refresh-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(refreshButton).toBeEnabled();
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('preserves the selected transfer month while refreshing in the foreground', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETagSequence: ['"etag-1"', '"etag-2"'],
    metadataDelayMs: 600,
    downloadBytes: createSqliteBytes([9, 8, 7, 6]),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);
  await installMockDbRuntime(page, { forceAlwaysOpen: true });

  await page.goto(appPath('#/transfers'));

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  await page.getByTestId('transfers-month-previous-button').click();
  const selectedMonthKey = await page
    .getByTestId('transfers-month-label')
    .getAttribute('data-month-key');
  expect(selectedMonthKey).not.toBeNull();

  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.getByTestId('route-transfers')).toBeVisible();
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    selectedMonthKey!,
  );
  await expect.poll(() => getGraphMetadataCallCount(page)).toBe(2);
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect(page.getByTestId('transfers-month-label')).toHaveAttribute(
    'data-month-key',
    selectedMonthKey!,
  );
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('shows one startup status surface while the freshness check is running', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataDelayMs: 3_500,
    metadataETag: '"etag-1"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([6, 6, 6, 6]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.getByTestId('route-accounts')).toHaveCount(0);
  await expect(page.getByTestId('progress-bar')).not.toHaveAttribute('value', /.+/u);

  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  await expect(page.getByTestId('route-transfers')).toHaveCount(0);

  await page.evaluate(() => {
    window.location.hash = '#/settings';
  });
  await expect(page.getByTestId('route-settings')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#/add';
  });
  await expect(page.getByTestId('route-add')).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = '#/accounts';
  });

  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('startup-sync-progress')).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  await expect(page.getByTestId('startup-sync-progress')).toHaveCount(0);
  await expect(page.getByTestId('route-accounts')).toBeVisible();
});

test('shows download progress feedback during slow startup sync', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadDelayMs: 2000,
    downloadBytes: createSqliteBytes(Array.from({ length: 10224 }, (_, i) => i % 256)), // 10 KB total
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('progress-indicator')).toBeVisible();
  await expect(page.getByTestId('progress-indicator')).toHaveAttribute('data-kind', 'download');

  const progressBar = page.getByTestId('progress-bar');
  await expect(progressBar).toHaveAttribute('max', '10240');

  // Verify it starts at ~50% (5KB) due to our mock half-way call
  await expect
    .poll(async () => {
      const value = await progressBar.getAttribute('value');
      return value ? parseInt(value, 10) : 0;
    })
    .toBeGreaterThanOrEqual(5120);

  await expect(page.getByTestId('progress-text')).toContainText('5 KB / 10 KB');

  // Wait for it to finish
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect(page.getByTestId('progress-indicator')).toHaveCount(0);
});

test('silently repairs a changed OneDrive item ID at the exact saved path', async ({ page }) => {
  const oldBinding = {
    driveId: 'drive-123',
    itemId: 'old-safe-save-id',
    name: 'conspectus.db',
    parentPath: '/',
  };
  const recoveredBinding = { ...oldBinding, itemId: 'new-safe-save-id' };
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('not_found', 'Old safe-save item ID is gone.', 404),
    ],
    resolvedPathBinding: recoveredBinding,
    metadataETag: '"etag-recovered"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      binding: oldBinding,
      metadata: { eTag: '"etag-old"' },
      dbBytes: createSqliteBytes([9, 9, 9]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 7, name: 'Recovered account', amountCents: 12_300, accountTypeId: 3 },
    ],
  });
  await installPersistedBinding(page, oldBinding);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  await expect(page.getByText('Recovered account')).toBeVisible();
  await expect(page.getByTestId('missing-file-recovery')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem('conspectus.selectedDriveItemBinding');
        if (rawValue === null) {
          return null;
        }
        return JSON.parse(rawValue).bindingsByAccountId['mock-home-account'];
      }),
    )
    .toEqual(recoveredBinding);

  await page.waitForTimeout(250);
  expect(await getGraphResolvePathCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(2);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('keeps the app usable and offers rebind when the exact saved path is missing', async ({
  page,
}) => {
  const oldBinding = {
    driveId: 'drive-123',
    itemId: 'deleted-item-id',
    name: 'conspectus.db',
    parentPath: '/',
  };
  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, {
    metadataErrorSequence: [createMockGraphError('not_found', 'Deleted item ID.', 404)],
    resolvePathError: createMockGraphError('not_found', 'No file at the saved path.', 404),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      binding: oldBinding,
      metadata: { eTag: '"etag-stale"' },
      dbBytes: createSqliteBytes([8, 8, 8]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 8, name: 'Account after rebind', amountCents: 45_600, accountTypeId: 3 },
    ],
  });
  await installPersistedBinding(page, oldBinding);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('missing-file-recovery')).toBeVisible();
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  await expect(page.getByText('Account after rebind')).toHaveCount(0);
  expect(await getGraphResolvePathCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem('conspectus.selectedDriveItemBinding');
        return rawValue === null
          ? null
          : JSON.parse(rawValue).bindingsByAccountId['mock-home-account'].itemId;
      }),
    )
    .toBe(oldBinding.itemId);

  await page.getByTestId('missing-file-recovery-button').click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();
  await page.getByRole('button', { name: 'Change DB file' }).click();
  await page.getByTestId('open-folder-folder-finance').click();
  await page.getByTestId('select-file-file-finance-db').click();

  await expect(page.getByTestId('missing-file-recovery')).toHaveCount(0);
  await expect(page.getByText('Downloaded the latest DB from OneDrive.').last()).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const rawValue = window.localStorage.getItem('conspectus.selectedDriveItemBinding');
        return rawValue === null
          ? null
          : JSON.parse(rawValue).bindingsByAccountId['mock-home-account'];
      }),
    )
    .toMatchObject({
      driveId: 'drive-123',
      itemId: 'file-finance-db',
      name: 'budget.db',
      parentPath: '/Finance',
    });

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByText('Account after rebind')).toBeVisible();
});

test('retries transient startup metadata failures before settling on the cached DB state', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
    ],
    metadataETag: '"etag-1"',
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([3, 3, 3, 3]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Cached DB is current with OneDrive.')).toBeVisible();
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('rejects cached account data when transient startup metadata failures exhaust retries', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
    ],
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([3, 3, 3, 3]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 99, name: 'Stale cached account', amountCents: 999_999, accountTypeId: 3 },
    ],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  await expect(page.getByText('Stale cached account')).toHaveCount(0);
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
  expect(await getDbRuntimeCloseCallCount(page)).toBeGreaterThan(0);
});

test('shows a startup sync error when transient metadata failures exhaust retries without a cached DB', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
      createMockGraphError('network_error', 'Temporary metadata outage.', 503),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('fails fast on non-retryable startup metadata errors and surfaces the clear reason', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [createMockGraphError('forbidden', 'Mock access denied.', 403)],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText('Mock access denied.');
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('starts one safe re-authentication and preserves the current screen after token expiry', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
    reauthenticateDelayMs: 250,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError(
        'unauthorized',
        'Your session has expired. Please sign in again to sync with OneDrive.',
        401,
      ),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/transfers'));

  await expect(page.getByTestId('transfers-route-status')).toContainText(
    'Your session has expired. Please sign in again to sync with OneDrive.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);

  const recoveryButton = page.getByTestId('stale-token-recovery-button');
  const previousUrl = page.url();
  await expect(recoveryButton).toBeVisible();
  await recoveryButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(recoveryButton).toBeDisabled();
  await expect(recoveryButton).toHaveAttribute('aria-busy', 'true');
  await expect(recoveryButton).toBeEnabled();

  const redirectStartPages = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __CONSPECTUS_REAUTHENTICATE_START_PAGES__?: string[];
        }
      ).__CONSPECTUS_REAUTHENTICATE_START_PAGES__,
  );
  expect(redirectStartPages).toEqual([previousUrl]);
  await expect(page).toHaveURL(previousUrl);
  await expect(page.getByTestId('route-transfers')).toBeVisible();
});

test('keeps stale-token recovery retryable on the current screen when redirect startup fails', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
    failReauthenticate: true,
  });
  await installMockGraphClient(page, {
    metadataErrorSequence: [
      createMockGraphError(
        'unauthorized',
        'Your session has expired. Please sign in again to sync with OneDrive.',
        401,
      ),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));
  const previousUrl = page.url();
  const recoveryButton = page.getByTestId('stale-token-recovery-button');
  await recoveryButton.click();

  await expect(page.getByTestId('stale-token-recovery-error')).toContainText(
    'Mock re-authentication failure.',
  );
  await expect(recoveryButton).toBeEnabled();
  await expect(recoveryButton).toHaveAttribute('aria-busy', 'false');
  await expect(page).toHaveURL(previousUrl);
  await expect(page.getByTestId('route-accounts')).toBeVisible();
});

test('downloads a fresh DB on startup when the OneDrive eTag changed', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadBytes: createSqliteBytes([5, 4, 3, 2]),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('retries transient startup download failures before downloading the latest DB', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
    ],
    downloadBytes: createSqliteBytes([5, 4, 3, 2]),
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
});

test('rejects cached transfer data when transient startup download failures exhaust retries', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
    ],
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installMockDbRuntime(page, {
    accountRows: [
      { accountId: 3, name: 'Checking', amountCents: 1_000, accountTypeId: 3 },
      { accountId: 4, name: 'Savings', amountCents: 2_000, accountTypeId: 3 },
    ],
    transferRows: [
      {
        transferId: 99,
        bookingDateEpochDay: Math.floor(Date.now() / 86_400_000),
        name: 'Stale cached transfer',
        amountCents: 500,
        fromAccountId: 3,
        toAccountId: 4,
        categoryIds: [],
        buyplace: null,
      },
    ],
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/transfers'));

  await expect(page.getByTestId('transfers-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('transfers-route-status')).toContainText(
    'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  await expect(page.getByTestId('transfers-route-cards')).toHaveCount(0);
  await expect(page.getByText('Stale cached transfer')).toHaveCount(0);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();
});

test('shows a startup sync error when transient download failures exhaust retries without a cached DB', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
      createMockGraphError('network_error', 'Temporary download outage.', 503),
    ],
  });
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
});

test('rejects the cached DB and offers sign-in again when download auth expires', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataETag: '"etag-2"',
    downloadErrorSequence: [
      createMockGraphError(
        'unauthorized',
        'Your session has expired. Please sign in again to sync with OneDrive.',
        401,
      ),
    ],
  });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([1, 1, 1, 1]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Your session has expired. Please sign in again to sync with OneDrive.',
  );
  await expect(page.getByTestId('accounts-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('route-settings')).toBeVisible();
});

test('rejects cached DB data when startup is offline', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: {
        eTag: '"etag-1"',
      },
      dbBytes: createSqliteBytes([4, 4, 4, 4]),
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(page.getByTestId('accounts-route-status')).toHaveAttribute('role', 'alert');
  await expect(page.getByTestId('accounts-route-cards')).toHaveCount(0);
  expect(await getCacheReadSnapshotCallCount(page)).toBe(0);
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('shows a startup sync error when offline without a cached DB', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, false);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'Connection is required to load the database.',
  );
  await expect(page.getByTestId('accounts-route-status')).toBeVisible();
  expect(await getCacheReadSnapshotCallCount(page)).toBe(0);
  expect(await getGraphMetadataCallCount(page)).toBe(0);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('triggers a fresh sync after a successful DB file selection', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/settings'));

  await expect(page.getByText('Cached DB is current with OneDrive.').first()).toBeVisible();
  const initialLastSync = await page.getByTestId('settings-last-sync').textContent();
  expect(initialLastSync).toContain('2026');

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await page.getByTestId('select-file-file-root-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByText('Cached DB is current with OneDrive.').last()).toBeVisible();
  const expectedLastSync = await page.evaluate(() => {
    const timestamp = (window as Window & { __CONSPECTUS_LAST_WRITTEN_SYNC_AT__?: string })
      .__CONSPECTUS_LAST_WRITTEN_SYNC_AT__;
    if (timestamp === undefined) {
      return null;
    }
    return `${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
      hour12: false,
    }).format(new Date(timestamp))} UTC`;
  });
  expect(expectedLastSync).not.toBeNull();
  await expect(page.getByTestId('settings-last-sync')).toHaveText(expectedLastSync ?? '');

  expect(await getCacheReadSnapshotCallCount(page)).toBe(6);
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('restored binding triggers sync after interactive sign-in without reload', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: false,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page);
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('auth-status-message')).toContainText('Signed out.');
  await expect(page.locator('.toast')).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
  await expect(page.getByText('Downloaded the latest DB from OneDrive.')).toBeVisible();

  expect(await getCacheReadSnapshotCallCount(page)).toBe(3);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('shows deployment footer metadata immediately on short pages', async ({ page }) => {
  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('deployment-info-footer')).toBeVisible();
  await expect(page.getByTestId('deployment-info-footer')).not.toHaveAttribute(
    'aria-hidden',
    'true',
  );
  await expect(page.getByTestId('deployment-info-label')).toHaveText(/^Ver\. \S+ .+ \d{2}:\d{2}$/u);

  const navBox = await page.getByRole('navigation', { name: 'Primary' }).boundingBox();
  const footerBox = await page.getByTestId('deployment-info-footer').boundingBox();

  expect(navBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThan(navBox!.y + navBox!.height - 1);
});

test('reveals deployment footer only when reaching the end of a scrollable page', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    extraRootDbFileCount: 80,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();

  const appContent = page.getByTestId('app-shell-content');
  const footer = page.getByTestId('deployment-info-footer');
  const appShellBottom = page.getByTestId('app-shell-bottom');

  await expect
    .poll(async () =>
      appContent.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
    )
    .toEqual(
      expect.objectContaining({
        clientHeight: expect.any(Number),
        scrollHeight: expect.any(Number),
      }),
    );

  await expect
    .poll(async () =>
      appContent.evaluate((element) => element.scrollHeight > element.clientHeight + 24),
    )
    .toBe(true);

  await expect(footer).toHaveAttribute('aria-hidden', 'true');
  await expect(appShellBottom).toHaveClass(/app-shell__bottom--with-safe-area/);

  await footer.evaluate((element) => {
    const footerElement = element as HTMLElement;
    const trackedWindow = window as typeof window & {
      __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
      __CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__?: MutationObserver;
    };

    trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ = 0;

    const observer = new MutationObserver((mutations) => {
      trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ =
        (trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ ?? 0) +
        mutations.filter((mutation) => mutation.attributeName === 'aria-hidden').length;
    });

    observer.observe(footerElement, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
    });

    trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__ = observer;
  });

  await appContent.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(footer).not.toHaveAttribute('aria-hidden', 'true');
  await expect(appShellBottom).not.toHaveClass(/app-shell__bottom--with-safe-area/);
  await page.waitForTimeout(300);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
            }
          ).__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ ?? 0,
      ),
    )
    .toBe(1);

  await appContent.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(footer).toHaveAttribute('aria-hidden', 'true');
  await expect(appShellBottom).toHaveClass(/app-shell__bottom--with-safe-area/);
  await page.waitForTimeout(300);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
            }
          ).__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__ ?? 0,
      ),
    )
    .toBe(2);

  await page.evaluate(() => {
    const trackedWindow = window as typeof window & {
      __CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__?: number;
      __CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__?: MutationObserver;
    };

    trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__?.disconnect();
    delete trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_OBSERVER__;
    delete trackedWindow.__CONSPECTUS_FOOTER_VISIBILITY_CHANGE_COUNT__;
  });
});

test('loads transfers from real DB bytes and navigates months to see fixture data', async ({
  page,
}) => {
  const fixtureBytes = Array.from(
    fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/test.db')),
  );

  await installMockAuthClient(page, { startAuthenticated: true });
  await installMockGraphClient(page, { metadataETag: '"etag-1"' });
  await installMockCacheStore(page, {
    startupSnapshot: {
      metadata: { eTag: '"etag-1"' },
      dbBytes: fixtureBytes,
    },
  });
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  // We set the date to April 15, 2024 to target our fixture data months.
  await page.clock.setFixedTime(new Date('2024-04-15T12:00:00.000Z'));

  await page.goto(appPath('#/transfers'));

  const monthLabel = page.getByTestId('transfers-month-label');
  await expect(monthLabel).toBeVisible();

  await expect(monthLabel).toHaveAttribute('data-month-key', '2024-04');
  await expect(page.getByTestId('transfer-card-2')).toBeVisible();
  const categorylessTransferCard = page.getByTestId('transfer-card-3');
  await expect(categorylessTransferCard).toBeVisible();
  expect(
    await categorylessTransferCard.evaluate((card) => window.getComputedStyle(card).paddingBottom),
  ).toBe('6.4px');

  await page.getByTestId('transfers-month-previous-button').click();
  await expect(monthLabel).toHaveAttribute('data-month-key', '2024-03');
  await expect(page.getByTestId('transfer-card-1')).toBeVisible();
});

test('supports sign-in and sign-out auth UX states in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    signInDelayMs: 250,
    signOutDelayMs: 250,
  });

  await page.goto(appPath('#/settings'));

  const statusMessage = page.getByTestId('auth-status-message');
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
  const safetyNotice = page.getByTestId('settings-safety-recovery');
  await expect(safetyNotice).toBeVisible();
  await expect(safetyNotice).toContainText(
    'Close the desktop app before using Conspectus Mobile. Never use both apps at the same time.',
  );
  await expect(safetyNotice).toContainText('file version history for 30 days');
  const recoveryLink = safetyNotice.getByRole('link', {
    name: "Read Microsoft's OneDrive recovery instructions",
  });
  await expect(recoveryLink).toHaveAttribute(
    'href',
    'https://support.microsoft.com/en-us/onedrive/restore-a-previous-version-of-a-file-stored-in-onedrive',
  );
  const recoveryLinkBox = await recoveryLink.boundingBox();
  expect(recoveryLinkBox).not.toBeNull();
  expect(recoveryLinkBox?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(statusMessage).toContainText('Signed out.');

  const signInButton = page.getByRole('button', { name: 'Sign in with Microsoft' });
  await signInButton.click();

  await expect(statusMessage).toContainText('Opening Microsoft sign-in...');
  await expect(signInButton).toBeDisabled();
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByText('mock-user@example.com')).toBeVisible();
  await expect(statusMessage).toContainText('Signed in.');

  const signOutButton = page.getByRole('button', { name: 'Sign out' });
  await signOutButton.click();

  await expect(statusMessage).toContainText('Signing out...');
  await expect(signOutButton).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await expect(statusMessage).toContainText('Signed out.');
});

test('allows selecting a OneDrive .db file from the settings browser', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));

  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );

  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByText('Finance')).toBeVisible();
  await expect(page.getByText('conspectus.db')).toBeVisible();
  await expect(page.getByText('notes.txt')).toHaveCount(0);

  await page.getByTestId('open-folder-folder-finance').click();
  await expect(page.getByText('/Finance')).toBeVisible();
  await expect(page.getByText('budget.db')).toBeVisible();

  await page.getByTestId('select-file-file-finance-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/Finance');
  await expect(page.getByTestId('settings-last-sync')).not.toBeEmpty();
  await expect(page.getByTestId('settings-build-version')).not.toBeEmpty();
  await expect(page.getByTestId('settings-build-time')).not.toBeEmpty();
  await page.getByTestId('settings-build-information').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('settings-build-information')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change DB file' })).toBeVisible();

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('budget.db');

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByTestId('open-folder-folder-finance')).toBeVisible();
  await expect(page.getByTestId('select-file-file-root-db')).toBeVisible();

  await page.getByTestId('select-file-file-root-db').click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
});

test('shows an in-panel loading state while OneDrive browse results are pending', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    listChildrenDelayMs: 1_500,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByTestId('binding-status-message')).toContainText(
    'Loading OneDrive files...',
  );
  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByTestId('db-file-browser')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Loading the current OneDrive folder...')).toBeVisible();
  await expect(page.getByTestId('db-file-browser-loading')).toBeVisible();

  await expect(page.getByTestId('open-folder-folder-finance')).toBeVisible();
  await expect(page.getByTestId('db-file-browser')).toHaveAttribute('aria-busy', 'false');
});

test('keeps the selected DB file after reload', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();
  expect(await getGraphListChildrenCallCount(page)).toBe(1);

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);

  await page.reload();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  expect(await getGraphListChildrenCallCount(page)).toBe(0);
});

test('allows cancelling a DB file rebind without changing the current selection', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await expect(page.getByTestId('db-file-browser')).toBeVisible();
  await expect(page.getByTestId('cancel-db-file-browser-button')).toBeVisible();

  await page.getByTestId('cancel-db-file-browser-button').click();

  await expect(page.getByTestId('db-file-browser')).toHaveCount(0);
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('/');
});

test('resets local app data only after destructive confirmation', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);
  await installMockCacheStore(page, {
    clearAllDelayMs: 250,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');

  await page.getByTestId('reset-local-app-data-button').click();
  await expect(page.getByTestId('reset-local-app-data-confirmation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('reset-local-app-data-confirmation')).not.toBeVisible();
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
  expect(await getCacheClearAllCallCount(page)).toBe(0);

  await page.getByTestId('reset-local-app-data-button').click();
  await page.getByTestId('confirm-reset-local-app-data-button').click();
  await expect(page.getByTestId('reset-local-app-data-confirmation')).toContainText(
    'Resetting local app data...',
  );
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeDisabled();

  await expect(page.getByTestId('reset-local-app-data-confirmation')).not.toBeVisible();
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);
  expect(await getCacheClearAllCallCount(page)).toBe(1);

  const persistedBindingValue = await page.evaluate(() =>
    window.localStorage.getItem('conspectus.selectedDriveItemBinding'),
  );
  expect(persistedBindingValue).toBeNull();

  await page.reload();
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'No DB file selected yet.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);
});

test('restores selected DB file after startup on a non-settings route', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page);

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-root-db').click();

  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
  expect(await getGraphListChildrenCallCount(page)).toBe(0);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('selected-db-file-summary')).toContainText('conspectus.db');
});

test('shows browse errors without pretending the OneDrive folder is empty', async ({ page }) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    failListChildren: true,
  });

  await page.goto(appPath('#/settings'));

  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByRole('alert')).toContainText('Mock OneDrive browse failure.');
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Mock OneDrive browse failure.',
  );
  await expect(page.getByText('No folders or .db files found here.')).toHaveCount(0);
});

test('shows binding error when token acquisition fails during OneDrive browse', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
    failGetAccessToken: true,
    getAccessTokenErrorCode: 'interaction_required',
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Authentication is required to access the selected OneDrive file.',
  );
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Authentication is required to access the selected OneDrive file.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);
});

test('shows validation error for malformed .db selection and does not persist a binding', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    includeMalformedDbFile: true,
  });

  await page.goto(appPath('#/settings'));
  await page.getByRole('button', { name: 'Select DB File' }).click();
  await page.getByTestId('select-file-file-malformed-db').click();

  await expect(page.getByRole('alert')).toContainText(
    'Selected file did not include the required OneDrive identifiers.',
  );
  await expect(page.getByTestId('binding-status-message')).toContainText(
    'File selection error. Selected file did not include the required OneDrive identifiers.',
  );
  await expect(page.getByTestId('selected-db-file-summary')).toHaveCount(0);

  const persistedBindingValue = await page.evaluate(() =>
    window.localStorage.getItem('conspectus.selectedDriveItemBinding'),
  );
  expect(persistedBindingValue).toBeNull();
});

test('processes redirect auth hash before route navigation and keeps signed-in status', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    consumeRedirectHashOnInitialize: true,
  });

  await page.goto(appPath('#code=mock-auth-code&state=mock-auth-state'));

  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByTestId('signed-in-account-summary')).toBeVisible();
  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
});

test('shows auth error UI when sign-in fails in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    failSignIn: true,
  });

  await page.goto(appPath('#/settings'));

  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByRole('alert')).toContainText('Mock sign-in failure.');
  await expect(page.getByTestId('auth-status-message')).toContainText(
    'Authentication error. Mock sign-in failure.',
  );
  await expect(page.getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
});

test('keeps hash route stable across direct loads and reloads', async ({ page }) => {
  const initialResponse = await page.goto(appPath('#/transfers'));
  expect(initialResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();

  const reloadResponse = await page.reload();
  expect(reloadResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 2, name: 'Transfers' })).toBeVisible();
});

test('does not trap browser back navigation from fallback hash route', async ({ page }) => {
  await page.goto(appPath('#/'));
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();

  await page.getByRole('link', { name: 'Transfers' }).click();
  await expect(page).toHaveURL(/#\/transfers$/);

  await page.goBack();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('falls back safely on invalid hash routes', async ({ page }) => {
  const initialResponse = await page.goto(appPath('#/unknown'));
  expect(initialResponse?.status()).toBe(200);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Accounts' })).toBeVisible();
});

test('exposes manifest and registers service worker', async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(globalThis, '__conspectusCspViolations', { value: violations });
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });

  const appResponse = await page.goto(appPath());
  expect(appResponse?.status()).toBe(200);

  const responseHeaders = appResponse?.headers() ?? {};
  const documentCsp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(documentCsp).toBeTruthy();
  expect(responseHeaders['content-security-policy']).toBe(`${documentCsp}; frame-ancestors 'none'`);
  expect(responseHeaders['x-content-type-options']).toBe('nosniff');
  expect(responseHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
  await page.evaluate(async () => document.fonts.ready);
  const cspViolations = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __conspectusCspViolations?: string[];
        }
      ).__conspectusCspViolations ?? [],
  );
  expect(cspViolations).toEqual([]);

  const manifestResponse = await page.request.get(appPath('manifest.webmanifest'));
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = (await manifestResponse.json()) as {
    name?: string;
    display?: string;
    start_url?: string;
    scope?: string;
    icons?: Array<{ src?: string; sizes?: string }>;
  };

  expect(manifest.name).toBe('Conspectus Mobile');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe(APP_BASE_PATH);
  expect(manifest.scope).toBe(APP_BASE_PATH);
  expect(manifest.theme_color).toBe('#f3f4f6');
  expect(manifest.background_color).toBe('#f3f4f6');

  const colorScheme = await page.locator('meta[name="color-scheme"]').getAttribute('content');
  expect(colorScheme).toBe('light dark');

  const themeColors = await page.locator('meta[name="theme-color"]').evaluateAll((elements) =>
    elements.map((element) => ({
      media: element.getAttribute('media'),
      content: element.getAttribute('content'),
    })),
  );
  expect(themeColors).toContainEqual({
    media: '(prefers-color-scheme: light)',
    content: '#f3f4f6',
  });
  expect(themeColors).toContainEqual({
    media: '(prefers-color-scheme: dark)',
    content: '#111827',
  });

  const manifestIcons = manifest.icons ?? [];
  expect(manifestIcons.length).toBeGreaterThan(0);

  for (const expectedIcon of REQUIRED_MANIFEST_ICONS) {
    expect(manifestIcons).toContainEqual(
      expect.objectContaining({
        src: expectedIcon.src,
        sizes: expectedIcon.sizes,
      }),
    );

    const iconResponse = await page.request.get(appPath(expectedIcon.src));
    expect(iconResponse.ok()).toBeTruthy();
  }

  const appleTouchIconHref = await page
    .locator('link[rel="apple-touch-icon"]')
    .first()
    .getAttribute('href');
  expect(appleTouchIconHref).toBe(appPath('icons/moneysack180x180.png'));

  const appleTouchIconResponse = await page.request.get(appPath('icons/moneysack180x180.png'));
  expect(appleTouchIconResponse.ok()).toBeTruthy();

  const expectedServiceWorkerScope = new URL(APP_BASE_PATH, page.url()).toString();

  await expect
    .poll(
      async () =>
        page.evaluate(async (appBasePath) => {
          if (!('serviceWorker' in navigator)) {
            return '';
          }

          const registration = await navigator.serviceWorker.getRegistration(appBasePath);
          if (!registration?.active) {
            return '';
          }

          return registration.scope;
        }, APP_BASE_PATH),
      { timeout: 15_000 },
    )
    .toBe(expectedServiceWorkerScope);
});

test('does not register service worker for parent-site routes outside the app base path', async ({
  page,
}) => {
  await page.goto(appPath('#/accounts'));
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(async (appBasePath) => {
          if (!('serviceWorker' in navigator)) {
            return false;
          }

          const registration = await navigator.serviceWorker.getRegistration(appBasePath);
          return Boolean(registration?.active);
        }, APP_BASE_PATH),
      { timeout: 15_000 },
    )
    .toBeTruthy();

  const parentRouteRegistrationScope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration?.scope ?? null;
  });

  expect(parentRouteRegistrationScope).toBeNull();

  const appRegistrationScope = await page.evaluate(async (appBasePath) => {
    const registration = await navigator.serviceWorker.getRegistration(appBasePath);
    return registration?.scope ?? '';
  }, APP_BASE_PATH);

  expect(appRegistrationScope).toContain(`${APP_BASE_PATH_WITHOUT_TRAILING_SLASH}/`);
});

const seedAndBindTestDb = async (
  page: import('@playwright/test').Page,
  graphOptions: MockGraphClientOptions = {},
  dbRuntimeOptions: Partial<MockDbRuntimeOptions> = {},
) => {
  await installReadyAddTransferTestDb(
    page,
    {
      forceAlwaysOpen: true,
      fromAccountOptionRows: [
        { accountId: 3, name: 'Girokonto', amountCents: 1000, accountTypeId: 3 },
      ],
      toAccountOptionRows: [
        { accountId: 4, name: 'Kreditkarte', amountCents: 0, accountTypeId: 3 },
      ],
      accountRows: [
        { accountId: 3, name: 'Girokonto', amountCents: 1000, accountTypeId: 3 },
        { accountId: 4, name: 'Kreditkarte', amountCents: 0, accountTypeId: 3 },
      ],
      categoryRows: [{ categoryId: 1, name: 'Lebensmittel' }],
      ...dbRuntimeOptions,
    },
    graphOptions,
  );
};

test('saves transfer happy path, transitions through upload states, and updates sync feedback', async ({
  page,
}) => {
  await seedAndBindTestDb(page, { uploadDelayMs: 200 });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Happy Path E2E Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1550');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });
  await page.getByTestId('add-transfer-category-1').selectOption({ label: 'Lebensmittel' });

  await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
  await page.getByTestId('add-transfer-submit').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  await expect(page.getByTestId('add-transfer-success-status')).toBeInViewport();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBe(0);
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-from-account')).toHaveValue('');
  await expect(page.getByTestId('add-transfer-to-account')).toHaveValue('');

  await page.goto(appPath('#/transfers'));
  await expect(page.getByRole('heading', { name: 'Transfers' })).toBeVisible();
  await expect(page.getByTestId('transfer-card-999')).toContainText('Happy Path E2E Transfer');

  await page.goto(appPath('#/accounts'));
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="3"]'),
  ).toHaveAttribute('data-amount-cents', '-550');
  await expect(
    page.locator('[data-testid^="account-amount-"][data-account-id="4"]'),
  ).toHaveAttribute('data-amount-cents', '1550');
});

test('scrolls add transfer validation errors into view after submit', async ({ page }) => {
  await seedAndBindTestDb(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBeGreaterThan(0);

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-validation-error').first()).toBeInViewport();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBe(0);
});

test('blocks a cleared transfer date before any local write or upload', async ({ page }) => {
  await seedAndBindTestDb(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-date').fill('');
  await page.getByTestId('add-transfer-name').fill('Valid transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  await page.getByTestId('add-transfer-submit').click();

  expect(
    await page
      .getByTestId('add-transfer-date')
      .evaluate((input) => (input as HTMLInputElement).validity.valueMissing),
  ).toBe(true);
  expect(await getLocalTransferWriteCallCount(page)).toBe(0);
  expect(await getGraphUploadCallCount(page)).toBe(0);
});

test('shows determinate upload progress during slow upload', async ({ page }) => {
  await seedAndBindTestDb(page, { uploadDelayMs: 2000 });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Slow Upload Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  await page.getByTestId('add-transfer-submit').click();

  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-indicator'),
  ).toBeVisible();
  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-bar'),
  ).toHaveAttribute('value', '10');
  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-bar'),
  ).toHaveAttribute('max', '20');
  await expect(page.getByTestId('add-transfer-success-status')).toHaveCount(0);

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.', {
    timeout: 15000,
  });
});

test('defers foreground refresh until an active upload completes', async ({ page }) => {
  await seedAndBindTestDb(page, {
    metadataETag: '"etag-2"',
    uploadDelayMs: 2000,
  });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Foreground Upload Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('100');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });
  await page.getByTestId('add-transfer-submit').click();

  await expect(
    page.getByTestId('add-transfer-upload-status').getByTestId('progress-indicator'),
  ).toBeVisible();
  const metadataCallsBeforeForegroundEvent = await getGraphMetadataCallCount(page);

  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.waitForTimeout(250);
  expect(await getGraphMetadataCallCount(page)).toBe(metadataCallsBeforeForegroundEvent);

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.', {
    timeout: 15000,
  });
  await expect
    .poll(() => getGraphMetadataCallCount(page))
    .toBe(metadataCallsBeforeForegroundEvent + 1);
});

test('keeps a failed upload retryable after hash navigation without a second local write', async ({
  page,
}) => {
  await seedAndBindTestDb(page, {
    uploadErrorSequence: [{ code: 'network_error', message: 'Failed to upload' }],
  });
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await page.getByTestId('add-transfer-name').fill('Retry Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1000');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  await page.getByTestId('add-transfer-submit').scrollIntoViewIfNeeded();
  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-form-error')).toBeVisible();
  await expect(page.getByTestId('add-transfer-retry')).toBeVisible();
  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  await expect
    .poll(() =>
      page.getByTestId('add-transfer-form').evaluate((form) => form.parentElement?.scrollTop ?? 0),
    )
    .toBeGreaterThan(0);

  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });

  await expect(page.getByTestId('route-transfers')).toBeVisible();
  await expect(page.getByTestId('pending-transfer-sync')).toBeVisible();
  await expect(page.getByTestId('pending-transfer-retry')).toBeEnabled();

  await page.getByTestId('pending-transfer-retry').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
  await expect(page.getByTestId('pending-transfer-sync')).not.toBeVisible();
  expect(await getLocalTransferWriteCallCount(page)).toBe(1);
});

test('recovers from OneDrive upload conflict by refreshing the DB before resubmitting', async ({
  page,
}) => {
  await seedAndBindTestDb(
    page,
    {
      uploadErrorSequence: [{ code: 'conflict', message: 'Precondition Failed' }],
      downloadDelayMs: 2000,
    },
    { forceAlwaysOpen: false },
  );
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();
  await expect(page.getByTestId('add-transfer-from-account').locator('option')).toHaveText([
    'Select source account',
    'Girokonto',
  ]);

  await page.getByTestId('add-transfer-name').fill('Conflict Transfer');
  await page.getByTestId('add-transfer-amount').pressSequentially('1000');
  await page.getByTestId('add-transfer-from-account').selectOption({ label: 'Girokonto' });
  await page.getByTestId('add-transfer-to-account').selectOption({ label: 'Kreditkarte' });

  const initialOpenCount = await getDbRuntimeOpenCallCount(page);
  const initialCloseCount = await getDbRuntimeCloseCallCount(page);
  const initialDownloadCount = await getGraphDownloadCallCount(page);

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.getByTestId('add-transfer-conflict-dialog')).toBeVisible();
  await expect(page.getByTestId('add-transfer-conflict-dialog')).toContainText(
    'OneDrive has newer data',
  );
  await expect(page.getByTestId('add-transfer-conflict-dialog')).not.toContainText(
    'Precondition Failed',
  );
  await expect(page.getByTestId('add-transfer-conflict-dialog')).not.toContainText('412');
  await expect(page.getByTestId('add-transfer-conflict-dialog')).not.toContainText('eTag');
  await expect(page.getByTestId('add-transfer-retry')).not.toBeVisible();
  await expect(page.getByTestId('add-transfer-resolve-conflict')).toBeVisible();
  await expect(page.getByTestId('add-transfer-submit')).not.toBeVisible();
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Conflict Transfer');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('10,00€');
  await expect(await getDbRuntimeCloseCallCount(page)).toBeGreaterThan(initialCloseCount);

  await expect(page.getByTestId('add-transfer-close')).toBeEnabled();
  await page.evaluate(() => {
    window.location.hash = '#/transfers';
  });
  await expect(page.getByTestId('pending-transfer-sync')).toBeVisible();
  await expect(page.getByTestId('pending-transfer-recover')).toBeEnabled();

  await page.getByTestId('pending-transfer-recover').click();

  await expect(page.getByTestId('pending-transfer-sync')).not.toBeVisible({ timeout: 10000 });
  await page.evaluate(() => {
    window.location.hash = '#/add';
  });
  await expect(page.getByTestId('add-transfer-submit')).toBeEnabled();
  await expect(page.getByTestId('add-transfer-name')).toHaveValue('Conflict Transfer');
  await expect(page.getByTestId('add-transfer-amount')).toHaveValue('10,00€');
  expect(await getGraphDownloadCallCount(page)).toBeGreaterThan(initialDownloadCount);
  expect(await getDbRuntimeOpenCallCount(page)).toBeGreaterThan(initialOpenCount);

  await page.getByTestId('add-transfer-submit').click();

  await expect(page.locator('.toast-container')).toContainText('Transfer saved and uploaded.');
});

test('blocks transfers when app is offline', async ({ page, context }) => {
  await seedAndBindTestDb(page);
  await page.goto(appPath('#/add'));
  await expect(page.getByTestId('add-transfer-date')).toBeVisible();

  await context.setOffline(true);

  await expect(page.getByTestId('add-transfer-offline-warning')).toBeVisible();
  await expect(page.getByTestId('add-transfer-submit')).toBeDisabled();
});
