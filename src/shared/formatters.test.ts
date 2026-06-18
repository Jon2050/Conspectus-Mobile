// Verifies amount and date formatting logic under different locales.
import { describe, expect, it } from 'vitest';
import { formatAmountDisplay, formatEpochDayToDate } from './formatters';

describe('formatters', () => {
  describe('formatAmountDisplay', () => {
    it('formats positive amount cents with a plus sign', () => {
      expect(formatAmountDisplay(1234567, 'positive')).toBe('+12.345,67€');
      expect(formatAmountDisplay(50, 'positive')).toBe('+0,50€');
    });

    it('formats negative amount cents with a minus sign', () => {
      expect(formatAmountDisplay(499900, 'negative')).toBe('-4.999,00€');
      expect(formatAmountDisplay(5, 'negative')).toBe('-0,05€');
    });

    it('formats neutral amount cents absolute without sign prefix', () => {
      expect(formatAmountDisplay(1250, 'neutral')).toBe('12,50€');
      expect(formatAmountDisplay(0, 'neutral')).toBe('0,00€');
    });
  });

  describe('formatEpochDayToDate', () => {
    it('formats dates in German locale (D. Month, Y)', () => {
      expect(formatEpochDayToDate(20000, 'de')).toBe('4. Oktober, 2024');
      expect(formatEpochDayToDate(20000, 'de-DE')).toBe('4. Oktober, 2024');
      expect(formatEpochDayToDate(20592, 'de')).toBe('19. Mai, 2026');
    });

    it('formats dates in English / other locales (Month D, Y)', () => {
      expect(formatEpochDayToDate(20000, 'en')).toBe('October 4, 2024');
      expect(formatEpochDayToDate(20000, 'en-US')).toBe('October 4, 2024');
      expect(formatEpochDayToDate(20592, 'en')).toBe('May 19, 2026');
    });

    it('defaults to German locale when no locale or null is provided', () => {
      expect(formatEpochDayToDate(20592)).toBe('19. Mai, 2026');
      expect(formatEpochDayToDate(20592, null)).toBe('19. Mai, 2026');
    });
  });
});
