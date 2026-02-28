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

const normalizeHash = (hash: unknown): string => {
  if (typeof hash !== 'string') {
    return '';
  }

  return hash.trim();
};

const getRouteCandidate = (hash: string): string | undefined => {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const normalizedPath = normalizedHash.startsWith('/') ? normalizedHash.slice(1) : normalizedHash;

  return normalizedPath.split(/[/?#]/)[0]?.toLowerCase();
};

export const resolveRouteFromHash = (hash: unknown): AppRouteKey => {
  const trimmedHash = normalizeHash(hash);
  const normalizedHash = trimmedHash.startsWith('#') ? trimmedHash.slice(1) : trimmedHash;
  const routeCandidate = getRouteCandidate(normalizedHash);

  if (routeCandidate && ROUTE_KEY_SET.has(routeCandidate)) {
    return routeCandidate as AppRouteKey;
  }

  return DEFAULT_ROUTE;
};

type HashRoutingWindowTarget = Pick<
  Window,
  'location' | 'addEventListener' | 'removeEventListener'
>;

const hasBrowserTarget = (
  target: HashRoutingWindowTarget | undefined,
): target is HashRoutingWindowTarget =>
  Boolean(target && target.location && typeof target.location.hash === 'string');

const readRouteFromTarget = (target: HashRoutingWindowTarget | undefined): AppRouteKey =>
  resolveRouteFromHash(target?.location.hash);

export const createHashRouteStore = (target?: HashRoutingWindowTarget): Readable<AppRouteKey> => {
  const resolvedTarget = target ?? (typeof window !== 'undefined' ? window : undefined);

  if (!hasBrowserTarget(resolvedTarget)) {
    return readable(DEFAULT_ROUTE);
  }

  return readable(readRouteFromTarget(resolvedTarget), (set) => {
    const handleHashChange = (): void => {
      set(readRouteFromTarget(resolvedTarget));
    };

    resolvedTarget.addEventListener('hashchange', handleHashChange);

    return () => {
      resolvedTarget.removeEventListener('hashchange', handleHashChange);
    };
  });
};
