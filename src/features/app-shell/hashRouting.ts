import { readable, type Readable } from 'svelte/store';

const ROUTE_KEYS = ['accounts', 'transfers', 'add', 'settings'] as const;
const ROUTE_KEY_SET = new Set<string>(ROUTE_KEYS);

export type AppRouteKey = (typeof ROUTE_KEYS)[number];

export type AppRoute = {
  readonly key: AppRouteKey;
  readonly label: string;
  readonly hash: string;
};

export const DEFAULT_ROUTE: AppRouteKey = 'accounts';

export const APP_ROUTES: readonly AppRoute[] = ROUTE_KEYS.map((key) => ({
  key,
  label: key === 'add' ? 'Add' : key.charAt(0).toUpperCase() + key.slice(1),
  hash: `#/${key}`,
}));

export const toRouteHash = (route: AppRouteKey): string => `#/${route}`;

export const resolveRouteFromHash = (hash: string): AppRouteKey => {
  const trimmedHash = hash.trim();
  const normalizedHash = trimmedHash.startsWith('#') ? trimmedHash.slice(1) : trimmedHash;
  const normalizedPath = normalizedHash.startsWith('/') ? normalizedHash.slice(1) : normalizedHash;
  const routeCandidate = normalizedPath.split('/')[0]?.toLowerCase();

  if (routeCandidate && ROUTE_KEY_SET.has(routeCandidate)) {
    return routeCandidate as AppRouteKey;
  }

  return DEFAULT_ROUTE;
};

const readRouteFromWindow = (target: Window): AppRouteKey =>
  resolveRouteFromHash(target.location.hash);

export const createHashRouteStore = (target: Window = window): Readable<AppRouteKey> =>
  readable(readRouteFromWindow(target), (set) => {
    const handleHashChange = (): void => {
      set(readRouteFromWindow(target));
    };

    target.addEventListener('hashchange', handleHashChange);

    return () => {
      target.removeEventListener('hashchange', handleHashChange);
    };
  });
