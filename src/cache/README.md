# `src/cache`

Responsibility:
- Persist and load local database cache and sync metadata.
- Encapsulate IndexedDB/Dexie schema and migrations.
- Provide cache invalidation and reset behavior.

Dependency boundaries:
- May depend on `@shared`.
- Must not depend on `@features`.

Expected public interfaces (`src/cache/index.ts`):
- `CachedFileBinding`: cache-key identity (`driveId`, `itemId`, path/name).
- `CachedSyncMetadata`: cached sync context (`eTag`, `lastSyncAtIso`).
- `CachedDatabaseSnapshot`: persisted DB payload + metadata envelope.
- `CacheStore`: read/write/clear API for startup sync and recovery flows.

M4 implementation target:
- Keep Dexie schema details private behind `CacheStore`.
- Expose deterministic cache behavior for online/offline startup decisions.
