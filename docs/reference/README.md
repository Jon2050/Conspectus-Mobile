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

The current snapshot is derived from `tests/fixtures/conspectusDB.db`, a full Conspectus SQLite database supplied for the `M5-09` schema capture.

The source database is used only to export schema. The committed reference artifact contains table/index definitions, not row data.

When PWA SQL queries change, update the snapshot only from the selected source database and keep `src/db/conspectusSchemaSnapshot.test.ts` passing.
