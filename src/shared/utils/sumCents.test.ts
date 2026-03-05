import { describe, expect, it } from 'vitest';
import { sumCents } from './sumCents';

describe('sumCents', () => {
  it('returns 0 for an empty list', () => {
    expect(sumCents([])).toBe(0);
  });

  it('returns the amount for a single-element list', () => {
    expect(sumCents([1250])).toBe(1250);
  });

  it('adds positive and negative cent values', () => {
    expect(sumCents([1250, -500, 250])).toBe(1000);
  });

  it('preserves exact integer sums near Number.MAX_SAFE_INTEGER', () => {
    const total = sumCents([Number.MAX_SAFE_INTEGER - 2, 1, 1]);

    expect(total).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(total)).toBe(true);
  });

  it('returns the value itself for a single-element list', () => {
    expect(sumCents([4200])).toBe(4200);
  });

  it('sums all-negative values correctly', () => {
    expect(sumCents([-100, -200, -300])).toBe(-600);
  });

  it('handles large cent values without overflow', () => {
    expect(sumCents([Number.MAX_SAFE_INTEGER, -1])).toBe(Number.MAX_SAFE_INTEGER - 1);
  });
});
