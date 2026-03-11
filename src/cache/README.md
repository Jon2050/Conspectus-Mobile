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

Dexie schema (`src/cache/dexieCacheStore.ts`):

- IndexedDB database name: `conspectus-mobile-cache`.
- Table `databaseSnapshots`: stores cached `dbBytes`, keyed by compound identity `[driveId+itemId]`.
- Table `syncMetadata`: stores binding display fields plus sync metadata (`name`, `parentPath`, `eTag`, `lastSyncAtIso`), keyed by the same compound identity.
- Reads return a snapshot only when both tables contain matching records for the binding, which keeps later sync decisions deterministic.

Migration strategy:

- Schema version `1` is the initial Dexie layout for M4-01.
- Future schema changes must add a new `db.version(<next>).stores(...).upgrade(...)` block instead of mutating version `1` in place.
- Settings reset must close live Dexie connections before deleting the IndexedDB database, or browser `deleteDatabase` calls can be blocked by the active connection.

M4 implementation target:

- Keep Dexie schema details private behind `CacheStore`.
- Expose deterministic cache behavior for online/offline startup decisions.
