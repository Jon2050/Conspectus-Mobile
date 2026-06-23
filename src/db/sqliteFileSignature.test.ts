// Verifies shared SQLite file-header validation used before caching and opening DB snapshots.
import { describe, expect, it } from 'vitest';

import { hasSqliteHeader, SQLITE_DATABASE_HEADER } from './sqliteFileSignature';

describe('sqlite file signature', () => {
  it('accepts bytes with the SQLite database header prefix', () => {
    const bytes = Uint8Array.from([...SQLITE_DATABASE_HEADER, 1, 2, 3]);

    expect(hasSqliteHeader(bytes)).toBe(true);
  });

  it('rejects short or mismatched payloads', () => {
    expect(hasSqliteHeader(Uint8Array.from(SQLITE_DATABASE_HEADER.slice(0, -1)))).toBe(false);

    const bytes = Uint8Array.from([...SQLITE_DATABASE_HEADER, 1, 2, 3]);
    bytes[0] = 0x00;

    expect(hasSqliteHeader(bytes)).toBe(false);
  });
});
