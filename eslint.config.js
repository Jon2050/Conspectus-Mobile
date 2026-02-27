import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  ...svelte.configs['flat/prettier'],
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ['src/auth/**/*.{ts,js,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@graph',
            '@graph/*',
            '**/graph',
            '**/graph/*',
            '@db',
            '@db/*',
            '**/db',
            '**/db/*',
            '@cache',
            '@cache/*',
            '**/cache',
            '**/cache/*',
            '@features',
            '@features/*',
            '**/features',
            '**/features/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/graph/**/*.{ts,js,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@db',
            '@db/*',
            '**/db',
            '**/db/*',
            '@cache',
            '@cache/*',
            '**/cache',
            '**/cache/*',
            '@features',
            '@features/*',
            '**/features',
            '**/features/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/db/**/*.{ts,js,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@auth',
            '@auth/*',
            '**/auth',
            '**/auth/*',
            '@graph',
            '@graph/*',
            '**/graph',
            '**/graph/*',
            '@cache',
            '@cache/*',
            '**/cache',
            '**/cache/*',
            '@features',
            '@features/*',
            '**/features',
            '**/features/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/cache/**/*.{ts,js,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@auth',
            '@auth/*',
            '**/auth',
            '**/auth/*',
            '@graph',
            '@graph/*',
            '**/graph',
            '**/graph/*',
            '@db',
            '@db/*',
            '**/db',
            '**/db/*',
            '@features',
            '@features/*',
            '**/features',
            '**/features/*',
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,js,svelte}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@features', '@features/*', '**/features', '**/features/*'] },
      ],
    },
  },
  {
    ignores: ['dist', 'coverage', 'node_modules'],
  },
);
