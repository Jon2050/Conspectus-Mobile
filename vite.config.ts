// Configures deterministic app base paths, shared aliases, and PWA build metadata.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// @ts-expect-error -- .mjs import has no type declarations
import { normalizeBasePath, toPreviewSlug } from './scripts/deploy-utils.mjs';

const DEFAULT_PRODUCTION_BASE_PATH = '/conspectus/';
const LIGHT_APP_THEME_COLOR = '#f3f4f6';
export const PWA_REGISTER_TYPE = 'prompt' as const;
const PACKAGE_JSON_URL = new URL('./package.json', import.meta.url);
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf-8')) as {
  version: string;
};
export const createBuildInfo = (
  version: string,
  commitSha: string | null,
  buildDate: Date = new Date(),
) => {
  if (commitSha !== null && !/^[a-f0-9]{40}$/u.test(commitSha)) {
    throw new Error('Build commit SHA must be a full lowercase Git SHA.');
  }

  const buildTime = buildDate.toISOString();
  return {
    version: `${version}+${commitSha?.slice(0, 8) ?? 'local'}`,
    commitSha,
    buildTimeUtc: buildTime.replace(/\.\d{3}Z$/u, 'Z'),
  };
};

export const verifyReleaseVersion = (version: string, tags: string[]): void => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\da-z.-]+))?$/iu.exec(version);
  if (!match) throw new Error(`Invalid package release version: ${version}`);
  const current = match.slice(1, 4).map(Number);
  for (const tag of tags) {
    const released = /^v(\d+)\.(\d+)\.(\d+)$/u.exec(tag);
    if (!released) continue;
    const release = released.slice(1).map(Number);
    const differentPart = current.findIndex((part, index) => part !== release[index]);
    if (
      (differentPart !== -1 && current[differentPart]! < release[differentPart]!) ||
      (differentPart === -1 && match[4] !== undefined)
    ) {
      throw new Error(`Package version ${version} is older than published release ${tag}.`);
    }
  }
};

const readGit = (args: string[]): string =>
  execFileSync('git', args, {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

const resolveCommitSha = (): string | null => {
  try {
    return readGit(['rev-parse', 'HEAD']);
  } catch {
    if (process.env.CI) {
      throw new Error('Cannot determine the checked-out Git commit for the CI build.');
    }
    return null;
  }
};

const normalizeBasePrefix = (value: string | undefined): string => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return '';
  }

  const withLeadingSlash = trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
  return withLeadingSlash.replace(/\/+$/g, '');
};

export const resolveBasePath = (environment: Record<string, string | undefined>): string => {
  const deployChannel = environment.DEPLOY_CHANNEL?.trim().toLowerCase();
  if (deployChannel === 'preview') {
    const previewSlug = toPreviewSlug(environment.DEPLOY_PREVIEW_SLUG ?? '');
    if (!previewSlug) {
      throw new Error('DEPLOY_PREVIEW_SLUG is required when DEPLOY_CHANNEL is set to "preview".');
    }

    const previewBasePrefix = normalizeBasePrefix(environment.DEPLOY_PREVIEW_BASE_PREFIX);
    return `${previewBasePrefix}/previews/${previewSlug}/`;
  }

  if (deployChannel === 'production') {
    return DEFAULT_PRODUCTION_BASE_PATH;
  }

  const configuredBasePath = environment.VITE_DEPLOY_BASE_PATH?.trim();
  if (configuredBasePath) {
    return normalizeBasePath(configuredBasePath);
  }

  return '/';
};

export const resolveViteBasePath = (
  environment: Record<string, string | undefined>,
  command: 'build' | 'serve',
  mode: string,
): string => (command === 'serve' && mode === 'development' ? '/' : resolveBasePath(environment));

export const loadBuildEnvironment = (
  mode: string,
  envDirectory: string = process.cwd(),
): Record<string, string | undefined> => ({ ...loadEnv(mode, envDirectory, ''), ...process.env });

export default defineConfig(({ command, mode }) => {
  const environment = loadBuildEnvironment(mode);
  const basePath = resolveViteBasePath(environment, command, mode);
  const commitSha = resolveCommitSha();
  if (command === 'build' && commitSha !== null) {
    verifyReleaseVersion(packageJson.version, readGit(['tag', '--list', 'v*']).split(/\r?\n/u));
  }
  const buildInfo = createBuildInfo(packageJson.version, commitSha);
  return {
    base: basePath,
    define: {
      __APP_BUILD_INFO__: JSON.stringify(buildInfo),
    },
    plugins: [
      svelte(),
      {
        name: 'app-build-info',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build-info.json',
            source: `${JSON.stringify(buildInfo, null, 2)}\n`,
          });
        },
      },
      VitePWA({
        registerType: PWA_REGISTER_TYPE,
        scope: basePath,
        workbox: {
          navigateFallback: 'index.html',
        },
        includeAssets: [
          'icons/moneysack.ico',
          'icons/moneysack180x180.png',
          'icons/moneysack192x192.png',
          'icons/moneysack-maskable192x192.png',
          'icons/moneysack32x32.png',
          'icons/moneysack64x64.png',
          'icons/moneysack256x256.png',
          'icons/moneysack512x512.png',
        ],
        manifest: {
          name: 'Conspectus Mobile',
          short_name: 'Conspectus',
          description: 'Mobile PWA for Conspectus.',
          theme_color: LIGHT_APP_THEME_COLOR,
          background_color: LIGHT_APP_THEME_COLOR,
          display: 'standalone',
          start_url: basePath,
          scope: basePath,
          icons: [
            {
              src: 'icons/moneysack.ico',
              sizes: 'any',
              type: 'image/x-icon',
            },
            {
              src: 'icons/moneysack32x32.png',
              sizes: '32x32',
              type: 'image/png',
            },
            {
              src: 'icons/moneysack64x64.png',
              sizes: '64x64',
              type: 'image/png',
            },
            {
              src: 'icons/moneysack180x180.png',
              sizes: '180x180',
              type: 'image/png',
            },
            {
              src: 'icons/moneysack192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/moneysack256x256.png',
              sizes: '256x256',
              type: 'image/png',
            },
            {
              src: 'icons/moneysack512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: 'icons/moneysack-maskable192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['./vitest-setup.ts'],
    },
    resolve: {
      alias: {
        '@auth': fileURLToPath(new URL('./src/auth', import.meta.url)),
        '@graph': fileURLToPath(new URL('./src/graph', import.meta.url)),
        '@db': fileURLToPath(new URL('./src/db', import.meta.url)),
        '@cache': fileURLToPath(new URL('./src/cache', import.meta.url)),
        '@openrouter': fileURLToPath(new URL('./src/openrouter', import.meta.url)),
        '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      },
    },
  };
});
