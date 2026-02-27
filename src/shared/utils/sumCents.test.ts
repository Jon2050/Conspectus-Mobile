import { describe, expect, it } from 'vitest';
import { sumCents } from './sumCents';

describe('sumCents', () => {
  it('returns 0 for an empty list', () => {
    expect(sumCents([])).toBe(0);
  });

  it('adds positive and negative cent values', () => {
    expect(sumCents([1250, -500, 250])).toBe(1000);
  });
});
