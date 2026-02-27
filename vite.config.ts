import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'Conspectus Mobile',
        short_name: 'Conspectus',
        description: 'Mobile PWA for Conspectus.',
        theme_color: '#dcdcdc',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
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
