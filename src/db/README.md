# `src/db`

Responsibility:

- Own SQLite/sql.js WASM runtime loading and database open/close lifecycle in the browser.
- Implement read queries and write transactions.
- Export updated database bytes for upload.

Dependency boundaries:

- May depend on `@shared`.
- Must not depend on `@features`.

Expected public interfaces (`src/db/index.ts`):

- `createSqlJsLoader` and `appSqlJsLoader`: cached sql.js runtime loader with Vite WASM asset resolution.
- `createBrowserDbRuntime` and `appBrowserDbRuntime`: open/close/exec/export lifecycle over snapshot bytes.
- `DbRuntimeError` + `DbRuntimeErrorCode`: deterministic runtime/open failure codes for startup handling.
- `AccountRecord`: normalized account row shape for Accounts UI.
- `createTransferMonthQueryService` + `getEpochDayMonthBounds`: inclusive epoch-day month filtering for transfer list reads.
- `TransferRecord`: normalized transfer row shape for Transfers UI.
- `CreateTransferInput` and `CreateTransferResult`: write-path contract.

M5/M6 implementation target:

- Encapsulate SQL details and runtime lifecycle in this module.
- Keep feature modules dependent on typed contracts, not raw sql.js globals.
