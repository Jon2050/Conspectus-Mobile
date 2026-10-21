// Verifies deployment base-path resolution, including values loaded from a local .env file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  PWA_REGISTER_TYPE,
  createBuildInfo,
  verifyReleaseVersion,
  loadBuildEnvironment,
  resolveBasePath,
  resolveViteBasePath,
} from '../vite.config';

describe('build identity', () => {
  const commitSha = '1234567890abcdef1234567890abcdef12345678';

  it('pairs the package version with the checked-out commit and actual UTC build time', () => {
    expect(createBuildInfo('0.9.05', commitSha, new Date('2026-10-21T10:20:30.456Z'))).toEqual({
      version: '0.9.05+12345678',
      commitSha,
      buildTimeUtc: '2026-10-21T10:20:30Z',
    });
  });

  it('distinguishes builds of different commits without changing the release version', () => {
    expect(createBuildInfo('0.9.05', 'a'.repeat(40)).version).not.toBe(
      createBuildInfo('0.9.05', 'b'.repeat(40)).version,
    );
  });

  it('captures a fresh timestamp when the same commit is rebuilt', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
      const first = createBuildInfo('0.9.05', commitSha);
      vi.setSystemTime(new Date('2026-10-21T11:30:00Z'));
      const second = createBuildInfo('0.9.05', commitSha);

      expect(first.version).toBe(second.version);
      expect(first.buildTimeUtc).toBe('2026-10-20T10:00:00Z');
      expect(second.buildTimeUtc).toBe('2026-10-21T11:30:00Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels source archives without a Git identity as local and rejects malformed SHAs', () => {
    expect(createBuildInfo('1.0.1-dev', null).version).toBe('1.0.1-dev+local');
    expect(() => createBuildInfo('0.9.05', 'invalid')).toThrow('Build commit SHA');
  });
});

describe('released version floor', () => {
  it.each(['0.9.05', '1.0.0-dev'])('rejects %s below a published v1.0.0', (version) => {
    expect(() => verifyReleaseVersion(version, ['v0.6.12', 'v1.0.0'])).toThrow(
      'older than published release',
    );
  });

  it.each(['1.0.0', '1.0.1-dev', '1.1.0'])(
    'accepts %s at or above the published release',
    (version) => {
      expect(() => verifyReleaseVersion(version, ['v1.0.0'])).not.toThrow();
    },
  );

  it('uses all release tags, regardless of ordering, and compares numeric version components', () => {
    expect(() => verifyReleaseVersion('1.9.0', ['v2.0.0', 'v1.0.0'])).toThrow();
    expect(() => verifyReleaseVersion('1.10.0-dev', ['v1.9.0'])).not.toThrow();
  });
});

describe('PWA update strategy', () => {
  it('requires user confirmation before activating a waiting service worker', () => {
    expect(PWA_REGISTER_TYPE).toBe('prompt');
  });
});

describe('resolveBasePath', () => {
  it('uses a VITE_DEPLOY_BASE_PATH value supplied by a local .env file', () => {
    const environmentDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'conspectus-vite-env-'));
    const inheritedBasePath = process.env.VITE_DEPLOY_BASE_PATH;
    fs.writeFileSync(
      path.join(environmentDirectory, '.env'),
      'VITE_DEPLOY_BASE_PATH= /local-conspectus/ \n',
    );

    try {
      delete process.env.VITE_DEPLOY_BASE_PATH;
      expect(resolveBasePath(loadBuildEnvironment('test', environmentDirectory))).toBe(
        '/local-conspectus/',
      );
    } finally {
      if (inheritedBasePath === undefined) {
        delete process.env.VITE_DEPLOY_BASE_PATH;
      } else {
        process.env.VITE_DEPLOY_BASE_PATH = inheritedBasePath;
      }
      fs.rmSync(environmentDirectory, { recursive: true, force: true });
    }
  });

  it('keeps deployment channel paths authoritative over a local override', () => {
    expect(
      resolveBasePath({
        DEPLOY_CHANNEL: 'preview',
        DEPLOY_PREVIEW_SLUG: 'test',
        VITE_DEPLOY_BASE_PATH: '/ignored/',
      }),
    ).toBe('/previews/test/');
  });

  it('uses the Conspectus website subtree for production', () => {
    expect(resolveBasePath({ DEPLOY_CHANNEL: 'production' })).toBe('/conspectus/');
  });

  it('serves local development at the registered localhost redirect root', () => {
    expect(
      resolveViteBasePath(
        {
          VITE_DEPLOY_BASE_PATH: '/custom-deploy/',
        },
        'serve',
        'development',
      ),
    ).toBe('/');
  });

  it('preserves configured base paths for builds and production preview', () => {
    const environment = {
      VITE_DEPLOY_BASE_PATH: '/custom-deploy/',
    };

    expect(resolveViteBasePath(environment, 'build', 'production')).toBe('/custom-deploy/');
    expect(resolveViteBasePath(environment, 'serve', 'production')).toBe('/custom-deploy/');
  });
});
