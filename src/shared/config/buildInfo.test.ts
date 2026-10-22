// Verifies bundle-owned metadata and local timestamp formatting behavior.
import { describe, expect, it, vi } from 'vitest';

import { formatBuildInfoLabel, formatBuildInfoTimestamp, getBuildInfo } from './buildInfo';

describe('buildInfo', () => {
  it('keeps the running bundle identity even when the server offers another deployment', () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildTimeUtc: '2099-01-01T00:00:00Z' }),
    });
    vi.stubGlobal('fetch', fetchImplementation);
    try {
      const buildInfo = getBuildInfo();
      expect(buildInfo).toEqual(__APP_BUILD_INFO__);
      expect(fetchImplementation).not.toHaveBeenCalled();
      expect(buildInfo.version).toMatch(/^\d+\.\d+\.\d+(?:-[\da-z.-]+\+(?:[a-f0-9]{8}|local))?$/iu);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('formats the UTC build timestamp in a supplied local timezone with a compact label', () => {
    expect(
      formatBuildInfoTimestamp('2026-03-11T03:05:00Z', {
        locale: 'de-DE',
        timeZone: 'Europe/Berlin',
      }),
    ).toBe('11.03.2026 04:05');
  });

  it('builds the footer label with version, date, and time segments', () => {
    expect(
      formatBuildInfoLabel(
        {
          version: '0.2.0',
          buildTimeUtc: '2026-03-11T03:05:00Z',
        },
        {
          locale: 'de-DE',
          timeZone: 'Europe/Berlin',
        },
      ),
    ).toBe('Ver. 0.2.0 11.03.2026 04:05');
  });
});
