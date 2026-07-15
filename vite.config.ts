// Configures deterministic app base paths, shared aliases, and PWA build metadata.
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// @ts-expect-error -- .mjs import has no type declarations
import { normalizeBasePath, toPreviewSlug } from './scripts/deploy-utils.mjs';

const DEFAULT_PRODUCTION_BASE_PATH = '/conspectus/webapp/';
const LIGHT_APP_THEME_COLOR = '#f3f4f6';
const PACKAGE_JSON_URL = new URL('./package.json', import.meta.url);
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf-8')) as {
  version: string;
};
const appVersion = packageJson.version;
const appBuildTimeUtc = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');

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

export const resolvePwaNavigationFallback = (
  environment: Record<string, string | undefined>,
): 'index.html' | 'index.php' =>
  environment.DEPLOY_CHANNEL?.trim().toLowerCase() === 'preview' ? 'index.html' : 'index.php';

export const loadBuildEnvironment = (
  mode: string,
  envDirectory: string = process.cwd(),
): Record<string, string | undefined> => ({ ...loadEnv(mode, envDirectory, ''), ...process.env });

export default defineConfig(({ command, mode }) => {
  const environment = loadBuildEnvironment(mode);
  const basePath = resolveViteBasePath(environment, command, mode);
  const navigationFallback = resolvePwaNavigationFallback(environment);

  return {
    base: basePath,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_TIME_UTC__: JSON.stringify(appBuildTimeUtc),
    },
    plugins: [
      svelte(),
      VitePWA({
        registerType: 'autoUpdate',
        scope: basePath,
        workbox: {
          additionalManifestEntries:
            navigationFallback === 'index.php'
              ? [{ url: navigationFallback, revision: appBuildTimeUtc }]
              : [],
          navigateFallback: navigationFallback,
        },
        includeAssets: [
          'icons/moneysack.ico',
          'icons/moneysack180x180.png',
          'icons/moneysack192x192.png',
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
        '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      },
    },
  };
});
