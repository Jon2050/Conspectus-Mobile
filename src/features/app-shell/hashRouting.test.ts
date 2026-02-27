import { describe, expect, it } from 'vitest';

import { DEFAULT_ROUTE, resolveRouteFromHash, toRouteHash } from './hashRouting';

describe('hashRouting', () => {
  it('resolves known routes from hash URLs', () => {
    expect(resolveRouteFromHash('#/accounts')).toBe('accounts');
    expect(resolveRouteFromHash('#/transfers')).toBe('transfers');
    expect(resolveRouteFromHash('#/add')).toBe('add');
    expect(resolveRouteFromHash('#/settings')).toBe('settings');
  });

  it('resolves fallback route for invalid hashes', () => {
    expect(resolveRouteFromHash('')).toBe(DEFAULT_ROUTE);
    expect(resolveRouteFromHash('#/')).toBe(DEFAULT_ROUTE);
    expect(resolveRouteFromHash('#/unknown')).toBe(DEFAULT_ROUTE);
    expect(resolveRouteFromHash('#/transfers/details')).toBe('transfers');
  });

  it('builds hash URLs for known routes', () => {
    expect(toRouteHash('accounts')).toBe('#/accounts');
    expect(toRouteHash('transfers')).toBe('#/transfers');
    expect(toRouteHash('add')).toBe('#/add');
    expect(toRouteHash('settings')).toBe('#/settings');
  });
});
