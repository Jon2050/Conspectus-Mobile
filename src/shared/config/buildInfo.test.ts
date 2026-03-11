// Verifies runtime build-info resolution precedence and local timestamp formatting behavior.
import { describe, expect, it, vi } from 'vitest';

import {
  formatBuildInfoLabel,
  formatBuildInfoTimestamp,
  getFallbackBuildInfo,
  loadBuildInfo,
  resolveDeployMetadataUrl,
} from './buildInfo';

describe('buildInfo', () => {
  it('resolves the deploy metadata path relative to the configured app base path', () => {
    expect(resolveDeployMetadataUrl('/conspectus/webapp/')).toBe(
      '/conspectus/webapp/deploy-metadata.json',
    );
    expect(resolveDeployMetadataUrl('/Conspectus-Mobile/previews/test')).toBe(
      '/Conspectus-Mobile/previews/test/deploy-metadata.json',
    );
  });

  it('prefers production deploy metadata when it is available and valid', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        buildTimeUtc: '2026-03-11T03:05:00Z',
      }),
    } as Response);

    await expect(
      loadBuildInfo({
        baseUrl: '/conspectus/webapp/',
        fetch: fetchImplementation,
      }),
    ).resolves.toEqual({
      version: getFallbackBuildInfo().version,
      buildTimeUtc: '2026-03-11T03:05:00Z',
    });

    expect(fetchImplementation).toHaveBeenCalledWith('/conspectus/webapp/deploy-metadata.json', {
      headers: {
        accept: 'application/json',
      },
    });
  });

  it('falls back to injected build info when deploy metadata is unavailable', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
    } as Response);

    await expect(
      loadBuildInfo({
        baseUrl: '/Conspectus-Mobile/previews/test/',
        fetch: fetchImplementation,
      }),
    ).resolves.toEqual(getFallbackBuildInfo());
  });

  it('falls back to injected build info when deploy metadata is malformed', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        buildTimeUtc: 'not-a-timestamp',
      }),
    } as Response);

    await expect(
      loadBuildInfo({
        baseUrl: '/conspectus/webapp/',
        fetch: fetchImplementation,
      }),
    ).resolves.toEqual(getFallbackBuildInfo());
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
