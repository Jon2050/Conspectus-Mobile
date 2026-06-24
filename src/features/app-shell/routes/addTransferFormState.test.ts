// Verifies form-state factory defaults, ISO date formatting, and epoch-day conversion logic.
import { describe, expect, it } from 'vitest';

import {
  createInitialFormFields,
  getTodayIsoDate,
  isoDateToEpochDay,
  NO_CATEGORY_SELECTED,
} from './addTransferFormState';

describe('addTransferFormState', () => {
  describe('NO_CATEGORY_SELECTED', () => {
    it('is a negative sentinel value', () => {
      expect(NO_CATEGORY_SELECTED).toBe(-1);
    });
  });

  describe('getTodayIsoDate', () => {
    it('returns a date string matching YYYY-MM-DD format', () => {
      const result = getTodayIsoDate();

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns a parseable date that represents today', () => {
      const result = getTodayIsoDate();
      const parsed = new Date(result + 'T00:00:00');
      const now = new Date();

      expect(parsed.getFullYear()).toBe(now.getFullYear());
      expect(parsed.getMonth()).toBe(now.getMonth());
      expect(parsed.getDate()).toBe(now.getDate());
    });
  });

  describe('isoDateToEpochDay', () => {
    it('converts the Unix epoch date (1970-01-01) to epoch day 0', () => {
      expect(isoDateToEpochDay('1970-01-01')).toBe(0);
    });

    it('converts 2024-01-15 to the expected epoch day', () => {
      // 2024-01-15 = 19,738 days since 1970-01-01
      const result = isoDateToEpochDay('2024-01-15');
      const expectedMs = Date.UTC(2024, 0, 15);
      const expectedEpochDay = Math.floor(expectedMs / (24 * 60 * 60 * 1000));

      expect(result).toBe(expectedEpochDay);
    });

    it('converts 2000-06-30 correctly', () => {
      const result = isoDateToEpochDay('2000-06-30');
      const expectedMs = Date.UTC(2000, 5, 30);
      const expectedEpochDay = Math.floor(expectedMs / (24 * 60 * 60 * 1000));

      expect(result).toBe(expectedEpochDay);
    });
  });

  describe('createInitialFormFields', () => {
    it('returns fields with today as the default date', () => {
      const fields = createInitialFormFields();

      expect(fields.date).toBe(getTodayIsoDate());
    });

    it('returns empty name', () => {
      const fields = createInitialFormFields();

      expect(fields.name).toBe('');
    });

    it('returns empty amount string', () => {
      const fields = createInitialFormFields();

      expect(fields.amount).toBe('');
    });

    it('returns null account selections', () => {
      const fields = createInitialFormFields();

      expect(fields.fromAccountId).toBeNull();
      expect(fields.toAccountId).toBeNull();
    });

    it('returns NO_CATEGORY_SELECTED for all three categories', () => {
      const fields = createInitialFormFields();

      expect(fields.category1Id).toBe(NO_CATEGORY_SELECTED);
      expect(fields.category2Id).toBe(NO_CATEGORY_SELECTED);
      expect(fields.category3Id).toBe(NO_CATEGORY_SELECTED);
    });

    it('returns empty buyplace', () => {
      const fields = createInitialFormFields();

      expect(fields.buyplace).toBe('');
    });

    it('returns a new object on each call', () => {
      const a = createInitialFormFields();
      const b = createInitialFormFields();

      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
