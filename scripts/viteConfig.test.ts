// Verifies deployment base-path resolution, including values loaded from a local .env file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBuildEnvironment, resolveBasePath, resolveViteBasePath } from '../vite.config';

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

  it('uses the Conspectus subdomain root for production', () => {
    expect(resolveBasePath({ DEPLOY_CHANNEL: 'production' })).toBe('/');
  });

  it('serves local development at the registered localhost redirect root', () => {
    expect(
      resolveViteBasePath(
        {
          VITE_DEPLOY_BASE_PATH: '/conspectus/webapp/',
        },
        'serve',
        'development',
      ),
    ).toBe('/');
  });

  it('preserves configured base paths for builds and production preview', () => {
    const environment = {
      VITE_DEPLOY_BASE_PATH: '/conspectus/webapp/',
    };

    expect(resolveViteBasePath(environment, 'build', 'production')).toBe('/conspectus/webapp/');
    expect(resolveViteBasePath(environment, 'serve', 'production')).toBe('/conspectus/webapp/');
  });
});
