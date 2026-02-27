import { describe, expect, it } from 'vitest';
import { OPTIONAL_RUNTIME_ENV_KEYS, REQUIRED_RUNTIME_ENV_KEYS } from './runtimeEnv';
import envExample from '../../../.env.example?raw';

const extractEnvKeys = (content: string): Set<string> => {
  const envLinePattern = /^\s*([A-Z0-9_]+)\s*=/;
  const keys = new Set<string>();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(envLinePattern);
    if (match?.[1]) {
      keys.add(match[1]);
    }
  }

  return keys;
};

describe('.env.example', () => {
  it('contains all runtime environment keys', () => {
    const envExampleKeys = extractEnvKeys(envExample);
    const requiredKeys = [...REQUIRED_RUNTIME_ENV_KEYS, ...OPTIONAL_RUNTIME_ENV_KEYS];
    const missingKeys = requiredKeys.filter((key) => !envExampleKeys.has(key));

    expect(missingKeys).toEqual([]);
  });
});
