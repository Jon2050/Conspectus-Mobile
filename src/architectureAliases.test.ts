import { describe, expect, it } from 'vitest';
import * as authModule from '@auth';
import * as cacheModule from '@cache';
import * as dbModule from '@db';
import * as featuresModule from '@features';
import * as graphModule from '@graph';
import * as openRouterModule from '@openrouter';
import * as sharedModule from '@shared';
import eslintConfigSource from '../eslint.config.js?raw';
import tsconfigAppSource from '../tsconfig.app.json?raw';
import viteConfigSource from '../vite.config.ts?raw';

const extractAliasKeys = (content: string, pattern: RegExp): string[] =>
  [...content.matchAll(pattern)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort();

const extractModuleLintRule = (moduleName: string): string => {
  const marker = `files: ['src/${moduleName}/**/*.{ts,js,svelte}'],`;
  const ruleStart = eslintConfigSource.indexOf(marker);
  const nextRuleStart = eslintConfigSource.indexOf('\n  {\n    files:', ruleStart + marker.length);

  return eslintConfigSource.slice(ruleStart, nextRuleStart);
};

describe('architecture module aliases', () => {
  it('resolve and expose module barrels', () => {
    expect(authModule).toBeDefined();
    expect(cacheModule).toBeDefined();
    expect(dbModule).toBeDefined();
    expect(featuresModule).toBeDefined();
    expect(graphModule).toBeDefined();
    expect(openRouterModule).toBeDefined();
    expect(sharedModule).toBeDefined();
    expect(typeof sharedModule).toBe('object');
  });

  it('keep vite aliases and tsconfig paths in sync', () => {
    const viteAliasKeys = extractAliasKeys(viteConfigSource, /^\s*'(@[^']+)':\s*fileURLToPath\(/gm);
    const tsconfigPathKeys = extractAliasKeys(tsconfigAppSource, /^\s*"(@[^"]+)":\s*\[/gm);

    expect(viteAliasKeys.length).toBeGreaterThan(0);
    expect(tsconfigPathKeys.length).toBeGreaterThan(0);
    expect(viteAliasKeys).toStrictEqual(tsconfigPathKeys);
  });

  it('prevents lower-level modules from depending on the OpenRouter provider boundary', () => {
    for (const moduleName of ['auth', 'graph', 'db', 'cache', 'shared']) {
      const lintRule = extractModuleLintRule(moduleName);

      expect(lintRule).toContain("'@openrouter'");
      expect(lintRule).toContain("'@openrouter/*'");
      expect(lintRule).toContain("'**/openrouter'");
      expect(lintRule).toContain("'**/openrouter/*'");
    }
  });
});
