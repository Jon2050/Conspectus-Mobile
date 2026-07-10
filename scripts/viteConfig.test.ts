// Verifies deployment base-path resolution, including values loaded from a local .env file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadBuildEnvironment, resolveBasePath } from '../vite.config';

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
});
