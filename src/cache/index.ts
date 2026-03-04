export interface CachedFileBinding {
  readonly driveId: string;
  readonly itemId: string;
  readonly name: string;
  readonly parentPath: string;
}

export interface CachedSyncMetadata {
  readonly eTag: string;
  readonly lastSyncAtIso: string;
}

export interface CachedDatabaseSnapshot {
  readonly binding: CachedFileBinding;
  readonly metadata: CachedSyncMetadata;
  readonly dbBytes: Uint8Array;
}

export interface CacheStore {
  readSnapshot(binding: CachedFileBinding): Promise<CachedDatabaseSnapshot | null>;
  writeSnapshot(snapshot: CachedDatabaseSnapshot): Promise<void>;
  clearSnapshot(binding: CachedFileBinding): Promise<void>;
  clearAll(): Promise<void>;
}
