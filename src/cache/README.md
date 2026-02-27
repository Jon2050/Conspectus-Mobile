# `src/cache`

Responsibility:
- Persist and load local database cache and sync metadata.
- Encapsulate IndexedDB/Dexie schema and migrations.
- Provide cache invalidation and reset behavior.

Dependency boundaries:
- May depend on `@shared`.
- Must not depend on `@features`.
