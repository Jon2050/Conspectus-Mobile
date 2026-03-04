import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// @ts-expect-error -- .mjs import has no type declarations
import { normalizeBasePath, toPreviewSlug } from './scripts/deploy-utils.mjs';

const DEFAULT_PRODUCTION_BASE_PATH = '/conspectus/webapp/';

const normalizeBasePrefix = (value: string | undefined): string => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return '';
  }

  const withLeadingSlash = trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
  return withLeadingSlash.replace(/\/+$/g, '');
};

const resolveBasePath = (): string => {
  const deployChannel = process.env.DEPLOY_CHANNEL?.trim().toLowerCase();
  if (deployChannel === 'preview') {
    const previewSlug = toPreviewSlug(process.env.DEPLOY_PREVIEW_SLUG ?? '');
    if (!previewSlug) {
      throw new Error('DEPLOY_PREVIEW_SLUG is required when DEPLOY_CHANNEL is set to "preview".');
    }

    const previewBasePrefix = normalizeBasePrefix(process.env.DEPLOY_PREVIEW_BASE_PREFIX);
    return `${previewBasePrefix}/previews/${previewSlug}/`;
  }

  if (deployChannel === 'production') {
    return DEFAULT_PRODUCTION_BASE_PATH;
  }

  const configuredBasePath = process.env.VITE_DEPLOY_BASE_PATH?.trim();
  if (configuredBasePath) {
    return normalizeBasePath(configuredBasePath);
  }

  return '/';
};

const basePath = resolveBasePath();

export default defineConfig({
  base: basePath,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: basePath,
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
        theme_color: '#dcdcdc',
        background_color: '#f5f5f5',
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
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
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
});
