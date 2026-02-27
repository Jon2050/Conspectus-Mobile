import { describe, expect, it } from 'vitest';
import * as authModule from '@auth';
import * as cacheModule from '@cache';
import * as dbModule from '@db';
import * as featuresModule from '@features';
import * as graphModule from '@graph';
import * as sharedModule from '@shared';

describe('architecture module aliases', () => {
  it('resolve and expose module barrels', () => {
    expect(authModule).toBeDefined();
    expect(cacheModule).toBeDefined();
    expect(dbModule).toBeDefined();
    expect(featuresModule).toBeDefined();
    expect(graphModule).toBeDefined();
    expect(sharedModule).toBeDefined();
    expect(typeof sharedModule).toBe('object');
  });
});
