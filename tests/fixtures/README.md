# `tests/fixtures`

Shared SQLite fixture data for DB-service tests.

- `test.db`: deterministic baseline schema + sample rows for accounts, transfers, categories, and transfer types.
- Tests must treat fixture files as read-only and mutate only runtime copies/in-memory state.
