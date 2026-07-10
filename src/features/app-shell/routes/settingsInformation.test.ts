// Verifies Settings timestamps are deterministic, UTC-based, and reject invalid metadata.
import { describe, expect, it } from 'vitest';

import { formatSettingsTimestampUtc } from './settingsInformation';

describe('formatSettingsTimestampUtc', () => {
  it('formats the supplied metadata timestamp in UTC', () => {
    expect(formatSettingsTimestampUtc('2026-03-04T12:30:00Z', 'en-GB')).toBe(
      '4 Mar 2026, 12:30 UTC',
    );
  });

  it('returns an empty value for invalid metadata', () => {
    expect(formatSettingsTimestampUtc('not-a-date', 'en-GB')).toBe('');
  });
});
