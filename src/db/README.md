# `src/db`

Responsibility:
- Own SQLite/sql.js database lifecycle in the browser.
- Implement read queries and write transactions.
- Export updated database bytes for upload.

Dependency boundaries:
- May depend on `@shared`.
- Must not depend on `@features`.
