import { describe, expect, it } from 'vitest';

import { AUTH_OIDC_SCOPES, AUTH_REQUEST_SCOPES, GRAPH_ONEDRIVE_FILE_SCOPES } from './scopes';

describe('auth scope contract', () => {
  it('defines the expected OIDC scopes for sign-in and session persistence', () => {
    expect(AUTH_OIDC_SCOPES).toEqual(['openid', 'profile', 'offline_access']);
  });

  it('defines the expected Graph scope for OneDrive file read/write', () => {
    expect(GRAPH_ONEDRIVE_FILE_SCOPES).toEqual(['Files.ReadWrite']);
  });

  it('exposes only the approved combined scope set', () => {
    expect(AUTH_REQUEST_SCOPES).toEqual(['openid', 'profile', 'offline_access', 'Files.ReadWrite']);
  });

  it('does not contain duplicate scopes', () => {
    expect(new Set(AUTH_REQUEST_SCOPES).size).toBe(AUTH_REQUEST_SCOPES.length);
  });

  it('does not include disallowed broad or redundant scopes', () => {
    const disallowedScopes = ['User.Read', 'Files.Read', 'Files.Read.All', 'Files.ReadWrite.All'];

    for (const scope of disallowedScopes) {
      expect(AUTH_REQUEST_SCOPES).not.toContain(scope);
    }
  });
});
