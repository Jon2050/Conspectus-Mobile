// Provides shared SQLite file-header validation for downloaded and opened DB snapshots.
export const SQLITE_DATABASE_HEADER = Uint8Array.from([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
]);

export const hasSqliteHeader = (snapshotBytes: Uint8Array): boolean => {
  if (snapshotBytes.length < SQLITE_DATABASE_HEADER.length) {
    return false;
  }

  return SQLITE_DATABASE_HEADER.every(
    (expectedByte, index) => snapshotBytes[index] === expectedByte,
  );
};
