# Reference Artifacts

This folder keeps repository-local source-of-truth reference artifacts used by implementation and tests.

## Conspectus SQLite Schema

`conspectus-live-schema.sql` is the schema snapshot used to validate PWA SQL queries.

Issue `M5-09` requested an export from a real Conspectus SQLite database using:

```sql
SELECT sql FROM sqlite_master
WHERE sql IS NOT NULL;
```

The committed snapshot orders the exported rows deterministically by SQLite object type and name so diffs remain reviewable.

The current snapshot is derived from `tests/fixtures/conspectusDB.db`, a full Conspectus SQLite database supplied locally for the `M5-09` schema capture. That source database is intentionally private and ignored by Git, so it is not available in a fresh clone.

The tracked source of truth for this repository is the committed `conspectus-live-schema.sql` snapshot. It contains table/index definitions, not row data.

When PWA SQL queries need a schema refresh and the private desktop DB source is available, export a new snapshot from that local database, review the SQL diff, and keep `src/db/conspectusSchemaSnapshot.test.ts` passing.
