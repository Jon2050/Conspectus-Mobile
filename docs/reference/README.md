# Reference Artifacts

This folder keeps repository-local source-of-truth reference artifacts used by implementation and tests.

## Conspectus SQLite Schema

`conspectus-live-schema.sql` is the schema snapshot used to validate PWA SQL queries.

Issue `M5-09` requested an export from a real Conspectus SQLite database using:

```sql
SELECT sql FROM sqlite_master
WHERE sql IS NOT NULL
ORDER BY type, name;
```

No external personal Conspectus database is available inside this repository checkout. The current snapshot is therefore derived from `tests/fixtures/test.db`, the checked-in SQLite fixture that represents the deterministic MVP schema used by the PWA DB-service tests.

Assumption: until a separate real user database is supplied, `tests/fixtures/test.db` is the repository-local live schema reference for current PWA SQL compatibility.

When PWA SQL queries change, update the snapshot only from the selected source database and keep `src/db/conspectusSchemaSnapshot.test.ts` passing.
