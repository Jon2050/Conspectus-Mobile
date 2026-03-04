# `src/db`

Responsibility:
- Own SQLite/sql.js database lifecycle in the browser.
- Implement read queries and write transactions.
- Export updated database bytes for upload.

Dependency boundaries:
- May depend on `@shared`.
- Must not depend on `@features`.

Expected public interfaces (`src/db/index.ts`):
- `AccountRecord`: normalized account row shape for Accounts UI.
- `TransferRecord`: normalized transfer row shape for Transfers UI.
- `CreateTransferInput` and `CreateTransferResult`: write-path contract.
- `DbClient`: initialize/query/write/export lifecycle surface.

M5/M6 implementation target:
- Encapsulate SQL details in this module.
- Keep feature modules dependent on typed contracts, not SQL statements.
