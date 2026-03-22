// Covers the app-shell navigation, auth mock flow, and OneDrive file selection behavior in a browser.
import { expect, test } from '@playwright/test';

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
        type: 'touchstart' | 'touchend',
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
      dispatchTouch('touchend', createTouchList(endX, endY), createTouchList(endX, endY));
    },
    {
      deltaX,
      deltaY,
    },
  );
};

type MockAuthClientOptions = {
  readonly initializeDelayMs?: number;
  readonly signInDelayMs?: number;
  readonly signOutDelayMs?: number;
  readonly consumeRedirectHashOnInitialize?: boolean;
  readonly failInitialize?: boolean;
  readonly failSignIn?: boolean;
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
  readonly metadataLastModifiedDateTime?: string;
  readonly downloadBytes?: readonly number[];
  readonly metadataErrorSequence?: readonly MockGraphError[];
  readonly downloadErrorSequence?: readonly MockGraphError[];
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
  readonly accountId: number;
  readonly name: string;
  readonly amountCents: number;
};

type MockDbRuntimeOptions = {
  readonly accountRows?: readonly MockDbRuntimeAccountRow[];
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
    let getFileMetadataCallCount = 0;
    let downloadFileCallCount = 0;
    const metadataErrorSequence = [...(mockOptions.metadataErrorSequence ?? [])];
    const downloadErrorSequence = [...(mockOptions.downloadErrorSequence ?? [])];
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
          eTag: mockOptions.metadataETag ?? '"etag-1"',
          sizeBytes: defaultDownloadBytes.length,
          lastModifiedDateTime: mockOptions.metadataLastModifiedDateTime ?? '2026-03-09T10:15:00Z',
          downloadUrl: 'https://download.example.com/conspectus.db',
        };
      },
      async downloadFile() {
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
          await new Promise((resolve) => {
            setTimeout(resolve, mockOptions.downloadDelayMs);
          });
        }

        return new Uint8Array(defaultDownloadBytes);
      },
      async uploadFile() {
        return {
          eTag: '"etag-2"',
          sizeBytes: defaultDownloadBytes.length,
          lastModifiedDateTime: '2026-03-09T11:15:00Z',
        };
      },
    };
    (
      window as Window & { __CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_LIST_CHILDREN_CALL_COUNT__ = listChildrenCallCount;
    (
      window as Window & { __CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_GET_FILE_METADATA_CALL_COUNT__ = getFileMetadataCallCount;
    (
      window as Window & { __CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__?: number }
    ).__CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__ = downloadFileCallCount;
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
    const accountRows = mockOptions.accountRows ?? [];
    let isOpen = mockOptions.forceAlwaysOpen ?? false;
    let execCallCount = 0;
    const isAccountsQuery = (sql: string): boolean => {
      const normalizedSql = sql.toLowerCase();
      return (
        normalizedSql.includes('from account') &&
        normalizedSql.includes('where visible = 1') &&
        normalizedSql.includes('ac_type_id not in (1, 2)')
      );
    };

    (window as Window & { __CONSPECTUS_APP_DB_RUNTIME__?: unknown }).__CONSPECTUS_APP_DB_RUNTIME__ =
      {
        async open() {
          isOpen = true;
        },
        close() {
          if (mockOptions.forceAlwaysOpen) {
            return;
          }
          isOpen = false;
        },
        isOpen() {
          return isOpen;
        },
        exec(sql: string) {
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

          if (isAccountsQuery(sql)) {
            if (mockOptions.failAccountsQuery) {
              throw {
                code: mockOptions.accountsQueryErrorCode ?? 'db_query_failed',
                message: mockOptions.accountsQueryErrorMessage ?? 'Mock accounts query failed.',
              };
            }

            return [
              {
                columns: ['account_id', 'name', 'amount'],
                values: accountRows.map((account) => [
                  account.accountId,
                  account.name,
                  account.amountCents,
                ]),
              },
            ];
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
      window as Window & { __CONSPECTUS_DB_RUNTIME_EXEC_CALL_COUNT__?: number }
    ).__CONSPECTUS_DB_RUNTIME_EXEC_CALL_COUNT__ = execCallCount;
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

const getGraphDownloadCallCount = async (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => {
    const value = (
      window as Window & {
        __CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__?: unknown;
      }
    ).__CONSPECTUS_GRAPH_DOWNLOAD_FILE_CALL_COUNT__;
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
  await expect(page.getByRole('heading', { level: 2, name: 'Add' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
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
  await expect(page.getByTestId('account-amount-positive-101')).toHaveText('+$12,345.67');
  await expect(page.getByTestId('account-amount-negative-102')).toHaveText('-$4,999.00');
  await expect(page.getByTestId('account-amount-neutral-103')).toHaveText('$0.00');

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
  await expect(page.getByTestId('accounts-route-status')).toContainText(
    'No visible non-primary accounts found or no DB file is ready.',
  );
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Cached DB is current with OneDrive.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-state',
    'synced',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_unchanged',
  );
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('shows syncing state and toast feedback while the startup freshness check is running', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
  });
  await installMockGraphClient(page, {
    metadataDelayMs: 1_500,
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Checking OneDrive for DB updates...',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-state',
    'syncing',
  );
  await expect(page.getByText('Syncing with OneDrive in the background...')).toBeVisible();

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Cached DB is current with OneDrive.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-state',
    'synced',
  );
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Cached DB is current with OneDrive.',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('keeps the cached DB as stale when transient startup metadata failures exhaust retries', async ({
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
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again. Using the last cached DB for now.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'stale');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_metadata_failed_cached',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(3);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Unable to refresh the selected OneDrive database metadata after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'error');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_metadata_failed',
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

  await expect(page.getByTestId('startup-sync-status')).toContainText('Mock access denied.');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'error');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_metadata_failed',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
});

test('surfaces a sign-in-again recovery action when startup metadata refresh fails because the session expired', async ({
  page,
}) => {
  await installMockAuthClient(page, {
    startAuthenticated: true,
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Your session has expired. Please sign in again to sync with OneDrive.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'error');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_auth_expired',
  );
  await expect(page.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
    'href',
    '#settings',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(0);
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Downloaded the latest DB from OneDrive.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-state',
    'synced',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_changed',
  );
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Downloaded the latest DB from OneDrive.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-state',
    'synced',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_changed',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
});

test('keeps the cached DB as stale when transient startup download failures exhaust retries', async ({
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
  await installPersistedBinding(page);
  await installMockStartupNetworkState(page, true);

  await page.goto(appPath('#/accounts'));

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again. Using the last cached DB for now.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'stale');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_download_failed_cached',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Unable to download the latest OneDrive database snapshot after 3 attempts because OneDrive or the network remained unavailable. Check your connection and try again.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'error');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_download_failed',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(3);
});

test('keeps the cached DB available and offers sign-in again when download fails because the session expired', async ({
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Your session has expired. Please sign in again to sync with OneDrive. Using the last cached DB for now.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'stale');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'online_auth_expired_cached',
  );
  await expect(page.getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
    'href',
    '#settings',
  );
  expect(await getGraphMetadataCallCount(page)).toBe(1);
  expect(await getGraphDownloadCallCount(page)).toBe(1);
});

test('uses the cached DB on startup when offline', async ({ page }) => {
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Offline mode using the last cached DB.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-state',
    'offline',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'offline_cached',
  );
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'No cached OneDrive database is available while offline.',
  );
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute('data-sync-state', 'error');
  await expect(page.getByTestId('startup-sync-status')).toHaveAttribute(
    'data-sync-branch',
    'offline_missing_cache',
  );
  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
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

  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Cached DB is current with OneDrive.',
  );

  await page.getByRole('button', { name: 'Change DB file' }).click();
  await page.getByTestId('select-file-file-root-db').click();

  await expect(page.getByTestId('binding-status-message')).toContainText('DB file selected.');
  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Cached DB is current with OneDrive.',
  );

  expect(await getCacheReadSnapshotCallCount(page)).toBe(3);
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
  await expect(page.getByTestId('startup-sync-status')).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await expect(page.getByTestId('auth-status-message')).toContainText('Signed in.');
  await expect(page.getByTestId('startup-sync-status')).toContainText(
    'Downloaded the latest DB from OneDrive.',
  );

  expect(await getCacheReadSnapshotCallCount(page)).toBe(1);
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

test('supports sign-in and sign-out auth UX states in settings', async ({ page }) => {
  await installMockAuthClient(page, {
    signInDelayMs: 250,
    signOutDelayMs: 250,
  });

  await page.goto(appPath('#/settings'));

  const statusMessage = page.getByTestId('auth-status-message');
  await expect(page.getByRole('heading', { level: 2, name: 'Settings' })).toBeVisible();
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
  await page.goto(appPath());

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
