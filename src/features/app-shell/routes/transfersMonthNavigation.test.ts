// Verifies transfer month-navigation date math and swipe-intent detection behavior.
import { describe, expect, it } from 'vitest';

import {
  formatMonthLabel,
  getCurrentMonthAnchorEpochDay,
  resolveSwipeIntent,
  shiftMonthAnchorEpochDay,
  toMonthKey,
} from './transfersMonthNavigation';

const MILLIS_PER_DAY = 86_400_000;
const toEpochDay = (year: number, month: number, day: number): number =>
  Math.floor(Date.UTC(year, month - 1, day) / MILLIS_PER_DAY);

describe('transfers month navigation', () => {
  it('defaults to the first day of the current local month', () => {
    const localNow = new Date(2026, 2, 19, 14, 35, 0, 0);

    expect(getCurrentMonthAnchorEpochDay(localNow)).toBe(toEpochDay(2026, 3, 1));
  });

  it.each([new Date(2026, 2, 29, 2, 30, 0, 0), new Date(2026, 9, 25, 2, 30, 0, 0)])(
    'keeps current-month anchor stable around DST boundary dates',
    (localNow) => {
      const monthAnchorEpochDay = getCurrentMonthAnchorEpochDay(localNow);

      expect(toMonthKey(monthAnchorEpochDay)).toMatch(/^\d{4}-\d{2}$/u);
      expect(formatMonthLabel(monthAnchorEpochDay, 'en-US')).toMatch(/^[A-Za-z]+ \d{4}$/u);
    },
  );

  it('shifts month anchors across year boundaries', () => {
    const decemberAnchor = toEpochDay(2026, 12, 1);
    const januaryAnchor = toEpochDay(2026, 1, 1);

    expect(toMonthKey(shiftMonthAnchorEpochDay(decemberAnchor, 1))).toBe('2027-01');
    expect(toMonthKey(shiftMonthAnchorEpochDay(januaryAnchor, -1))).toBe('2025-12');
  });

  it('preserves leap-year month progression when shifting anchors', () => {
    const februaryLeapYearAnchor = toEpochDay(2024, 2, 1);

    expect(toMonthKey(shiftMonthAnchorEpochDay(februaryLeapYearAnchor, 1))).toBe('2024-03');
    expect(toMonthKey(shiftMonthAnchorEpochDay(februaryLeapYearAnchor, -1))).toBe('2024-01');
  });

  it('formats deterministic month labels in UTC-safe mode', () => {
    const monthAnchor = toEpochDay(2026, 3, 1);

    expect(formatMonthLabel(monthAnchor, 'en-US')).toBe('March 2026');
  });

  it('resolves swipe intent for clear horizontal gestures', () => {
    expect(
      resolveSwipeIntent({
        startX: 240,
        startY: 200,
        endX: 120,
        endY: 210,
      }),
    ).toBe('next');

    expect(
      resolveSwipeIntent({
        startX: 120,
        startY: 200,
        endX: 255,
        endY: 188,
      }),
    ).toBe('previous');
  });

  it('rejects short or vertical-dominant gestures to avoid accidental month switching', () => {
    expect(
      resolveSwipeIntent({
        startX: 200,
        startY: 300,
        endX: 230,
        endY: 305,
      }),
    ).toBeNull();

    expect(
      resolveSwipeIntent({
        startX: 210,
        startY: 180,
        endX: 270,
        endY: 290,
      }),
    ).toBeNull();
  });
});
