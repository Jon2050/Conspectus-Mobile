import { beforeAll } from 'vitest';
import { waitLocale } from 'svelte-i18n';
import './src/i18n/index.ts';

beforeAll(async () => {
  await waitLocale();
});
