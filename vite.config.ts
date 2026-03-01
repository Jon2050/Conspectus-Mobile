import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const DEFAULT_PRODUCTION_BASE_PATH = '/conspectus/webapp/';

const normalizeBasePath = (value: string): string => {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const normalizeBasePrefix = (value: string | undefined): string => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return '';
  }

  const withLeadingSlash = trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`;
  return withLeadingSlash.replace(/\/+$/g, '');
};

const toPreviewSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\//g, '_2f_')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

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
        'icons/moneysack32x32.png',
        'icons/moneysack64x64.png',
        'icons/moneysack256_256.png',
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
            src: 'icons/moneysack64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'icons/moneysack256_256.png',
            sizes: '256x256',
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
