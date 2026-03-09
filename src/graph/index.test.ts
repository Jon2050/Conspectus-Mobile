// Verifies the public graph barrel keeps the stable browse/read/upload client contract.
import { describe, expect, it, vi } from 'vitest';

import { createGraphClient } from './index';

type CreateGraphClientArg = Parameters<typeof createGraphClient>[0];
type AuthClient = CreateGraphClientArg['authClient'];

const createMinimalAuthClient = (): AuthClient => ({
  initialize: vi.fn(async () => {}),
  getSession: vi.fn(() => ({
    isAuthenticated: true,
    account: {
      homeAccountId: 'home-account-id',
      username: 'user@example.com',
      displayName: 'Test User',
    },
  })),
  signIn: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  getAccessToken: vi.fn(async () => 'graph-access-token'),
});

describe('graph barrel contract', () => {
  it('exports a graph client factory with the stable method surface', () => {
    const client = createGraphClient({
      authClient: createMinimalAuthClient(),
      fetchFn: vi.fn(async () => new Response(null, { status: 200 })),
    });

    expect(client).toEqual(
      expect.objectContaining({
        listChildren: expect.any(Function),
        getFileMetadata: expect.any(Function),
        downloadFile: expect.any(Function),
        uploadFile: expect.any(Function),
      }),
    );
  });
});
