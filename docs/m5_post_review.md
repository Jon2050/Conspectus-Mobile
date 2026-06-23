# M5 Post-Implementation Review

Date: 2026-06-23
Repository: `Jon2050/Conspectus-Mobile`

---

## Review Scope

- **Primary focus:** Milestone M5 — Accounts and Transfers Read UX
- **Secondary:** Regression spot-check of Milestones 1 through 4
- **Review type:** Static analysis and exhaustive code reading (no commands executed, all quality gates confirmed green prior to review)
- **Reviewed by:** Antigravity (comprehensive multi-pass review)

---

## Issue Coverage Matrix (M5)

| Issue | Title                                                           | Status               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #55   | M5-01 Integrate sql.js runtime and DB open service              | ⚠️ Partial           | WASM loading configured via [sqlJsLoader.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/sqlJsLoader.ts) with Vite `?url` asset resolution. Lifecycle (open/close/exec/export) implemented in [browserDbRuntime.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/browserDbRuntime.ts) with foreign key pragma enforcement, SQLite header validation, and deterministic error normalization via [dbRuntimeErrors.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/dbRuntimeErrors.ts). Supersession guard (`canApply`) exists, but a narrow stale-runtime assignment race remains; see M-06. |
| #56   | M5-02 Implement account query service                           | ✅ Fully implemented | [accountQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/accountQueryService.ts) extracts only visible non-primary accounts (`WHERE visible = 1 AND ac_type_id NOT IN (1, 2)`) and sorts deterministically by `ac_order ASC, LOWER(name) ASC, account_id ASC`. Strict column/row validation with typed mapping. `listAllAccounts()` also implemented for transfer route enrichment.                                                                                                                                                                                                                             |
| #57   | M5-03 Implement transfer-by-month query service                 | ✅ Fully implemented | [transferMonthQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/transferMonthQueryService.ts) computes inclusive UTC month bounds via `getEpochDayMonthBounds()` and queries transfers with `WHERE date >= ? AND date <= ?` ordered by `date ASC, transfer_id ASC`. Strict row mapping including nullable category ID filtering.                                                                                                                                                                                                                                                                                 |
| #58   | M5-04 Implement month navigation state and gestures             | ✅ Fully implemented | Touch gestures and Previous/Next buttons are unified in [TransfersRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/TransfersRoute.svelte). Swipe math is isolated in [transfersMonthNavigation.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/transfersMonthNavigation.ts) with configurable horizontal distance threshold (48px default) and dominance ratio (1.2x), NaN/Infinity guard, and proper DST-safe epoch-day arithmetic.                                                                                                                |
| #59   | M5-05 Build Accounts screen UI                                  | ✅ Fully implemented | [AccountsRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/AccountsRoute.svelte) displays account names, locale-formatted amounts, semantic color-coded borders, skeleton loading states, and empty states. Responsive grid with mobile-first card layout and `@media (max-width: 380px)` breakpoint.                                                                                                                                                                                                                                                                                        |
| #60   | M5-06 Build Transfers screen UI                                 | ✅ Fully implemented | [TransfersRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/TransfersRoute.svelte) renders transfer cards with UTC epoch-day date formatting, name/buyplace composition, from→to account direction arrows, category badges, and semantic amount coloring. Primary income/spendings accounts display localized labels (EINNAHMEN/AUSGABEN). Dark mode amount colors are overridden via scoped CSS custom properties.                                                                                                                                                                          |
| #61   | M5-07 Add formatting utilities and localization-ready rendering | ⚠️ Partial           | [formatters.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/shared/formatters.ts) provides `formatAmountDisplay` (EUR currency with sign prefix by semantic) and `formatEpochDayToDate` (UTC-safe `Intl.DateTimeFormat`) with German default locale. Core strings are i18n-wired via `svelte-i18n`, but the transfer month header, bottom-nav landmark, and document language still miss active-locale wiring; see S-07, S-08, and S-09.                                                                                                                                                                                       |
| #62   | M5-08 Add read-flow tests (unit + integration + e2e smoke)      | ✅ Fully implemented | Comprehensive multi-layer test suite: (a) DB query service unit tests with real sql.js WASM runtimes and in-memory fixtures, (b) controller unit tests with mock query services, (c) Svelte SSR component tests for all view states, (d) integration tests loading from real fixture DB files, (e) schema snapshot compatibility test, (f) 2100+ line Playwright E2E suite with mock auth/graph/cache/db-runtime stacks.                                                                                                                                                                                                                     |
| #63   | M5-09 Capture live DB schema as reference artifact              | ✅ Fully implemented | Checked-in live schema at [conspectus-live-schema.sql](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/docs/reference/conspectus-live-schema.sql) with source provenance comment. Validated by [conspectusSchemaSnapshot.test.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/conspectusSchemaSnapshot.test.ts) which creates a runtime from the schema DDL, verifies required columns via `PRAGMA table_info`, and exercises all three query services against the empty schema. The source-DB provenance documentation should clarify that `conspectusDB.db` is ignored/local; see S-11.                             |
| #174  | M5-10 Follow-up UI cleanup and usability polish                 | ✅ Fully implemented | Transfer cards use `overflow-wrap: anywhere` on name and account spans. Dark-mode amount colors use dedicated `--transfers-amount-positive/negative` overrides. Category badges use pill-rounded `app-badge` styling. Mobile breakpoint at 380px collapses header grid to single column.                                                                                                                                                                                                                                                                                                                                                     |

---

## Prior Milestone Spot-Check

| Milestone | Spot-Check Result | Notes                                                                                                                                                                                                                                                                                        |
| --------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | ✅ No regressions | Svelte 5 scaffolding, module aliases (`@auth`, `@graph`, `@db`, `@cache`, `@shared`, `@features`), `loadRuntimeEnv()` startup validation, `RuntimeEnvError` rendering, and quality CI baseline (`format → lint → typecheck → test → build → verify → e2e`) all remain intact and functional. |
| M2        | ⚠️ Issues found   | Dual deployment channels and build verifier coverage remain intact, but production smoke currently disables live security-header verification; see M-05.                                                                                                                                     |
| M3        | ✅ No regressions | MSAL sign-in/out redirect flows, settings controllers, file binding browser, local data reset, E2E mock auth/graph client infrastructure, and auth client resolver with `__CONSPECTUS_AUTH_CLIENT__` window injection all continue to function correctly.                                    |
| M4        | ⚠️ Issues found   | Dexie-backed cache store, startup freshness decisions, progress indicators, and sync state transitions are preserved, but the cache/runtime handoff needs stronger full-SQLite validation and a final supersession guard check; see M-06 and M-07.                                           |

---

## Findings

### Effort: Small

Findings that can be resolved in under 20 minutes with isolated, localized changes.

#### S-01: Query Services Recreate Instances on Route Mount

- **Severity:** Low
- **Status:** ✅ Fixed in `review-fixing`
- **Perspective:** Code Quality
- **Location:** [AccountsRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/AccountsRoute.svelte#L16-L18), [TransfersRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/TransfersRoute.svelte#L33-L37)
- **Description:** Both primary routes instantiate new query service instances (e.g. `createAccountQueryService(resolveAppDbRuntime())`) within their default property declarations on every mount. The `@db` module exports pre-configured singletons (`appAccountQueryService`, `appTransferMonthQueryService`, `appCategoryQueryService`) in [index.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/index.ts), but these are bypassed because they are bound to the static `appBrowserDbRuntime` at import time, which prevents them from using the E2E mock DB runtime injected via `window.__CONSPECTUS_APP_DB_RUNTIME__` on localhost ([dbRuntimeResolver.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/dbRuntimeResolver.ts#L33-L39)).
- **Impact:** Minor runtime overhead from redundant object instantiation on each route mount. Barrel-exported singletons are dead code for the main read routes, creating an inconsistent API surface.
- **Recommendation:** Refactor the query service factories in the `db` module to resolve the DB runtime dynamically at call time (e.g., via a getter function or proxy) rather than capturing it in the factory constructor. This allows route components to import and use the pre-configured query singletons directly.

#### S-02: `sumCents` Utility Lacks Safe Integer Assertions

- **Severity:** Low
- **Status:** ✅ Fixed in `review-fixing`
- **Perspective:** Code Quality / Maintainability
- **Location:** [sumCents.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/shared/utils/sumCents.ts#L1-L2)
- **Description:** The `sumCents` utility reduces an array of amounts to calculate a sum via `amounts.reduce((total, amount) => total + amount, 0)`, but it does not check if the individual elements or the final returned sum are safe integers. The test file validates behavior near `Number.MAX_SAFE_INTEGER` but the production code itself performs no runtime guard.
- **Impact:** Minor risk of silent precision loss if floating-point numbers or unsafe integers are passed. In practice, M5 consumers always provide integer cents from strict DB row mapping, limiting real-world exposure.
- **Recommendation:** Add defensive checks utilizing `Number.isSafeInteger` within the accumulator function to throw a clear developer error if an unsafe or float value is encountered.

#### S-03: `getEpochDayMonthBounds` Relies on Implicit Date Overflow Behavior

- **Severity:** Low
- **Status:** ✅ Fixed in `review-fixing`
- **Perspective:** Maintainability
- **Location:** [transferMonthQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/transferMonthQueryService.ts#L138)
- **Description:** The `getEpochDayMonthBounds` utility determines the last epoch day of a month via `toEpochDayFromUtcDate(year, monthIndex + 1, 0)`. Passing `0` as the day parameter relies on JavaScript's `Date.UTC()` overflow behavior, which wraps back to the last day of the preceding month. While correct per ECMA-262 spec, this is not self-documenting.
- **Impact:** Increases cognitive load for future maintainers. The behavior is well-tested in [transferMonthQueryService.test.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/transferMonthQueryService.test.ts) (leap year, boundary, and inclusive bounds tests), mitigating practical risk.
- **Recommendation:** Add a brief inline comment on line 138 explaining that day `0` resolves to the final day of the target month in UTC, or alias the pattern through a named helper function.

#### S-04: Duplicate Data Load on Route Mount

- **Severity:** Low
- **Status:** ✅ Fixed in `review-fixing`
- **Perspective:** Bug Hunting / Code Quality
- **Location:** [AccountsRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/AccountsRoute.svelte#L21-L43), [TransfersRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/TransfersRoute.svelte#L43-L68)
- **Description:** Both routes subscribe to `appSyncStateStore` during initialization. Svelte stores synchronously call subscribers with the current state upon subscription. If the initial sync state is `'synced'`, `'stale'`, or `'offline'`, the subscriber calls `controller.load()` immediately during component initialization. Then `onMount` (AccountsRoute) or the `$: { void controller.load(...) }` reactive block (TransfersRoute) triggers a second identical `controller.load()` call.
  - **AccountsRoute:** `lastObservedSyncState` is initialized to `'idle'` (line 21). If the sync store is `'synced'`, the subscription callback sees `syncSnapshot.state !== lastObservedSyncState` as true, calls `controller.load()`, then `onMount` at line 42 calls `controller.load()` again.
  - **TransfersRoute:** `lastObservedSyncState` is initialized to `'idle'` (line 43). The subscription callback calls `controller.load(monthAnchorEpochDay)`, and then the reactive block `$: { void controller.load(monthAnchorEpochDay); }` at lines 48-50 runs.
- **Impact:** Redundant SQLite queries and view model re-mappings on every route navigation when the app is already synced. Each `controller.load()` resets state to `loading` and rebuilds the full account/transfer map from scratch.
- **Recommendation:** Initialize `lastObservedSyncState` to the current value of `appSyncStateStore` using Svelte's `get()` utility rather than `'idle'`, so the synchronous subscription callback doesn't treat the initial emission as a state change. For TransfersRoute, consider guarding the reactive block with a flag that prevents re-entry on the initial synchronous mount.

#### S-05: `isDbRuntimeNotOpenError` Uses Duck Typing Instead of Type Guard

- **Severity:** Low
- **Status:** ✅ Fixed in `review-fixing`
- **Perspective:** Code Quality / Type Safety
- **Location:** [accountsRouteController.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/accountsRouteController.ts#L53-L57), [transfersRouteController.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/transfersRouteController.ts#L59-L63)
- **Description:** Both route controllers define a local `isDbRuntimeNotOpenError` function that checks for `error.code === 'db_not_open'` via duck typing and unsafe type assertion (`(error as { code?: unknown }).code`). The `@db` module already exports `isDbRuntimeError` ([dbRuntimeErrors.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/dbRuntimeErrors.ts#L32-L33)) as a proper `instanceof` type guard. The helper is also duplicated identically across both controllers.
- **Impact:** Loss of type narrowing benefits. The duck-typed check could match unrelated error objects that coincidentally have `code: 'db_not_open'`. Code duplication across two controllers.
- **Recommendation:** Import `isDbRuntimeError` from `@db` and replace the duck-typed check with `isDbRuntimeError(error) && error.code === 'db_not_open'`. Extract the shared helper into a single location if needed.

#### S-06: Duplicate `MILLIS_PER_DAY` Constant Across Modules

- **Severity:** Low
- **Perspective:** Maintainability
- **Location:** [transferMonthQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/transferMonthQueryService.ts#L29), [transfersMonthNavigation.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/transfersMonthNavigation.ts#L2), [formatters.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/shared/formatters.ts#L2)
- **Description:** The constant `MILLIS_PER_DAY = 86_400_000` (or `24 * 60 * 60 * 1000`) is defined independently in three separate source files. While the values are trivially correct, this creates a minor DRY violation.
- **Impact:** If the constant were ever to be used in a more complex calculation, independent definitions increase the risk of drift. Currently purely cosmetic.
- **Recommendation:** Extract `MILLIS_PER_DAY` to a shared constant in `@shared/utils` or a dedicated `dateConstants.ts` module, and import it across all consumers.

#### S-07: Transfer Month Header Ignores Active App Locale

- **Severity:** Low
- **Perspective:** UI/UX / Documentation / Testing
- **Location:** [TransfersRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/TransfersRoute.svelte#L45-L46), [transfersMonthNavigation.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/transfersMonthNavigation.ts#L59-L68), [i18n/index.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/i18n/index.ts#L8-L18)
- **Description:** `formatMonthLabel()` accepts an optional locale, but `TransfersRoute.svelte` calls it as `formatMonthLabel(monthAnchorEpochDay)` instead of passing `$locale`. The transfer card dates and amounts do pass `$locale`, so the month header can use the browser/default `Intl` locale while the rest of the route follows the Svelte i18n locale.
- **Impact:** Locale rendering is inconsistent, especially for German-default sessions running in an English browser or for future locale switching. The current route tests verify button labels and swipe labels, but not that the visible month header follows the active app locale.
- **Recommendation:** Pass `$locale` to `formatMonthLabel()` in `TransfersRoute.svelte` and add a component/helper test that verifies the month label changes for at least German and English locales.

#### S-08: Bottom Navigation Landmark Label Is Hardcoded in English

- **Severity:** Low
- **Perspective:** Accessibility / UI/UX / Documentation
- **Location:** [AppShell.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/AppShell.svelte#L347), [de.json](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/i18n/de.json#L2-L7), [en.json](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/i18n/en.json#L2-L7)
- **Description:** The bottom navigation uses localized visual labels via `$_('nav.' + route.key)`, but the navigation landmark remains `aria-label="Primary"`. Neither locale file defines a nav landmark key.
- **Impact:** German UI sessions expose an English screen-reader landmark even though the route labels are localized. This is a small but concrete gap in the M5 bottom-nav accessibility/localization work.
- **Recommendation:** Add a `nav.primary` (or equivalent) key to both locale files, bind the `<nav>` `aria-label` through `$_('nav.primary')`, and extend the AppShell render test to assert the localized landmark.

#### S-09: Root Document Language Is Hardcoded to English

- **Severity:** Medium
- **Perspective:** Accessibility / UI/UX
- **Location:** [index.html](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/index.html#L2), [i18n/index.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/i18n/index.ts#L8-L18), [main.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/main.ts#L1-L44)
- **Description:** The static HTML root is `<html lang="en">`, while `svelte-i18n` defaults the app locale to German unless the browser locale starts with English. No startup code updates `document.documentElement.lang` after i18n initialization.
- **Impact:** In the default German UI, browser language metadata and assistive technology pronunciation rules remain English. This can affect screen-reader output and automated accessibility tooling across every route.
- **Recommendation:** Set the root language from the active Svelte i18n locale during startup, preferably by subscribing to `locale` in the i18n/bootstrap path and updating `document.documentElement.lang` whenever it changes. Add an accessibility-oriented test that asserts the document language matches the active app locale.

#### S-10: Internal DB Services Import Core Types Through the Public Barrel

- **Severity:** Low
- **Perspective:** Architecture Alignment / Maintainability
- **Location:** [accountQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/accountQueryService.ts#L4), [transferMonthQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/transferMonthQueryService.ts#L4), [categoryQueryService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/categoryQueryService.ts#L3), [index.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/index.ts#L36-L56)
- **Description:** Query-service implementation files import `AccountRecord`, `TransferRecord`, `CategoryRecord`, and `BrowserDbRuntime` types from `./index`, while `index.ts` re-exports those same services and defines the records. This makes the implementation depend on the module's public barrel instead of an internal contract file.
- **Impact:** The current TypeScript type-only imports work, but the public barrel becomes both API surface and internal dependency hub. That increases the chance of import cycles or barrel churn as M6 adds write services and more DB contracts.
- **Recommendation:** Move shared DB record/runtime contracts to an internal `src/db/types.ts` (or similarly named) module, import implementation types from that file, and have `index.ts` re-export them for external consumers.

#### S-11: Schema Provenance Docs Reference an Ignored Local DB Without Saying So

- **Severity:** Low
- **Perspective:** Documentation / Maintainability
- **Location:** [docs/reference/README.md](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/docs/reference/README.md#L18), [conspectus-live-schema.sql](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/docs/reference/conspectus-live-schema.sql#L3), [Architecture-and-Implementation-Plan.md](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/docs/Architecture-and-Implementation-Plan.md#L573), [.gitignore](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/.gitignore#L18)
- **Description:** The schema documentation says the snapshot is derived from `tests/fixtures/conspectusDB.db`, but that database file is explicitly ignored. A fresh clone therefore receives the SQL snapshot and `tests/fixtures/test.db`, but not the full source DB named in the provenance text.
- **Impact:** A new contributor cannot reproduce the schema-refresh process from tracked files alone and may assume a required fixture is accidentally missing. This weakens the documentation ownership rule that `docs/reference/` is the canonical schema reference.
- **Recommendation:** Clarify that `conspectusDB.db` is a private/local source artifact, identify the tracked SQL snapshot as the repository source of truth, and document the expected refresh process when the local desktop DB source is available.

---

### Effort: Medium

Findings that require up to 60 minutes of work, potentially touching multiple files or requiring new tests.

#### M-01: Touch Swipe Surface Lacks Visual Feedback and Drag Interception

- **Severity:** Medium
- **Perspective:** UI/UX
- **Location:** [TransfersRoute.svelte](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/routes/TransfersRoute.svelte#L86-L119)
- **Description:** The touch gesture navigation listens only to `touchstart` and `touchend` events to detect swipe direction. It has no `touchmove` listener, resulting in two UX issues:
  1. **Vertical Jitter:** If the user moves their finger slightly vertically during a horizontal swipe, the browser scrolls the page vertically (despite `touch-action: pan-y` on the swipe surface at line 329), creating jarring visual jitter.
  2. **No Perceived Response:** The interface remains visually static during the drag gesture and jumps to a new month only after the user lifts their finger, with no intermediate visual feedback.
- **Impact:** Swiping feels less responsive compared to native mobile month-switching patterns. The `touch-action: pan-y` CSS declaration (line 329) correctly delegates vertical scrolling to the browser, but once a horizontal swipe intent is recognized, there is no mechanism to prevent the vertical scroll from competing.
- **Recommendation:** Implement a `touchmove` listener that calculates ongoing horizontal and vertical offsets. If horizontal movement exceeds a small threshold (e.g. 10px), call `event.preventDefault()` to lock vertical scrolling. Optionally apply a CSS `transform: translateX(...)` to the list wrapper to follow the user's finger, creating a smooth drag-to-switch visual.

#### ~~M-02: WASM CSP Directive Lacks Automated Build Verification~~

~~- **Severity:** Medium~~
~~- **Perspective:** Security / CI/CD~~
~~- **Location:** [verify-build-channel.mjs](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/scripts/verify-build-channel.mjs)~~
~~- **Description:** The build verifier script does not check for the `'wasm-unsafe-eval'` CSP directive.~~
**INVALIDATED:** The build verifier script [`verify-build-channel.mjs`](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/scripts/verify-build-channel.mjs#L255-L279) contains a comprehensive `verifyCspMetaTag()` function that:

1. Extracts the CSP meta tag content from the built `index.html` (lines 228-244).
2. Validates required directives (`default-src`, `script-src`, `style-src`, `img-src`, `object-src`, `base-uri`) are present (lines 256-272).
3. Explicitly asserts that `script-src` includes `'wasm-unsafe-eval'` for sql.js WASM support (lines 274-279).
4. Validates all required `connect-src` sources for OneDrive/Microsoft auth endpoints (lines 281-302).

This check runs on every CI push via the quality workflow's "Build Verification" job (lines 254-284 of [quality.yml](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/.github/workflows/quality.yml#L254-L284)). The original claim that this check is missing is factually incorrect.

#### M-03: Category Query Service Lacks `listAllCategories` Integration Test Against Real Fixture DB

- **Severity:** Low
- **Perspective:** Testing
- **Location:** [categoryQueryService.test.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/categoryQueryService.test.ts)
- **Description:** The `categoryQueryService` unit tests use hand-crafted mock query results rather than the real sql.js runtime and fixture database. In contrast, `accountQueryService.test.ts` and `transferMonthQueryService.test.ts` both include tests that create real in-memory databases from fixture data and exercise queries end-to-end. The `categoryQueryService` only appears in integration via the `conspectusSchemaSnapshot.test.ts` (which runs against an empty schema) and the `TransfersRoute.integration.test.ts` (which verifies the transfers route renders the March fixture and the `Salary` transfer, but doesn't assert individual category names in the output).
- **Impact:** Lower confidence that the category query SQL (`SELECT category_id, name FROM category ORDER BY LOWER(name) ASC`) works correctly against the real fixture DB schema. Mock-only tests cannot catch SQL syntax issues or schema drift.
- **Recommendation:** Add a fixture-backed integration test to `categoryQueryService.test.ts` (similar to the account/transfer service tests) that opens the tracked `tests/fixtures/test.db` fixture, runs `listAllCategories()`, and asserts expected results. Also add a transfer-route integration assertion for at least one rendered category badge so the category enrichment path is covered beyond mocked unit tests.

#### M-04: Redundant SQLite Header Validation in `cachedDatabaseSnapshotService.ts` and `browserDbRuntime.ts`

- **Severity:** Low
- **Perspective:** Code Quality / Maintainability
- **Location:** [cachedDatabaseSnapshotService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/cachedDatabaseSnapshotService.ts#L5-L7), [browserDbRuntime.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/browserDbRuntime.ts#L8-L10)
- **Description:** The `SQLITE_DATABASE_HEADER` constant and header-checking logic (`matchesSqliteHeader` / `hasSqliteHeader`) is defined independently in two modules:
  1. `browserDbRuntime.ts` validates the header in `open()` before passing bytes to sql.js.
  2. `cachedDatabaseSnapshotService.ts` validates the header after downloading bytes from OneDrive, before caching.
     Both contain identical 16-byte header arrays and nearly identical checking functions. Since `browserDbRuntime.open()` is always called after the cached snapshot is read, the header is validated twice in the normal online-changed flow: once during download, and again when opening.
- **Impact:** Minor code duplication and redundant validation. The defense-in-depth is reasonable for a security-sensitive path, but the duplicated constant arrays should be shared.
- **Recommendation:** Extract the `SQLITE_DATABASE_HEADER` constant and a shared `hasSqliteHeader()` utility into the `@db` module (or `@shared/utils`) and import it in both locations.

#### M-05: Production Smoke Security-Header Checks Are Disabled

- **Severity:** Medium
- **Perspective:** CI/CD / Security
- **Location:** [deploy-production.yml](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/.github/workflows/deploy-production.yml#L12), [deploy-production.yml](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/.github/workflows/deploy-production.yml#L271), [verify-production-deploy-smoke.mjs](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/scripts/verify-production-deploy-smoke.mjs#L97-L113)
- **Description:** The production deployment workflow sets `PRODUCTION_SMOKE_SKIP_SECURITY_HEADER_CHECKS: 'true'` and passes it to `verify-production-deploy-smoke.mjs`. That bypasses the smoke verifier's checks for a live `Content-Security-Policy` header, `X-Content-Type-Options: nosniff`, and a non-empty `Referrer-Policy`.
- **Impact:** CI verifies the built CSP meta tag, but the production smoke does not verify the live site's response headers. If the website host drops or misconfigures those headers, the production deploy workflow can still pass.
- **Recommendation:** Enable production smoke security-header checks once the hosting layer supports the required headers. If that is intentionally deferred to a later infrastructure milestone, document the deferral in `docs/CI-CD-Pipelines.md` and keep the workflow variable clearly tied to that open work.

#### M-06: DB Supersession Guard Can Still Apply a Stale Runtime in a Narrow Race

- **Severity:** Medium
- **Perspective:** Bug Hunting / Architecture Design
- **Location:** [browserDbRuntime.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/browserDbRuntime.ts#L106-L120), [startupDbRuntimeSync.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/startupDbRuntimeSync.ts#L27-L30)
- **Description:** `browserDbRuntime.open()` checks `options.canApply()` before initializing sql.js and again before closing the existing database. It does not re-check after `new sqlJsRuntime.Database(snapshotBytes)` and `applyRequiredPragmas(nextDatabase)` before assigning `database = nextDatabase`. If a newer startup sync supersedes the operation during that final window, `syncDbRuntimeForStartupDecision()` can return `'superseded'` while the stale runtime has already replaced the shared database.
- **Impact:** Overlapping sync operations can still produce a stale DB runtime in a narrow timing window, contradicting the intended M5/M4 supersession guarantee. This becomes more important for M6 because local writes and upload rollback will rely on the active runtime representing the latest accepted snapshot.
- **Recommendation:** Re-check `canApply()` immediately before assigning `database = nextDatabase`; if it is false, close `nextDatabase` and leave the existing runtime untouched. Add a focused unit test that flips the guard during database construction or pragma application.

#### M-07: New Snapshots Are Cached Before Full SQLite Validation

- **Severity:** Medium
- **Perspective:** Bug Hunting / Security / Next Milestone Readiness
- **Location:** [cachedDatabaseSnapshotService.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/cachedDatabaseSnapshotService.ts#L55-L72), [browserDbRuntime.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/browserDbRuntime.ts#L118-L120), [dexieCacheStore.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/cache/dexieCacheStore.ts#L98-L115)
- **Description:** `downloadAndCacheSnapshot()` downloads bytes, validates only size and SQLite header, then immediately writes them to the Dexie cache. The stronger sql.js validation happens later when `browserDbRuntime.open()` constructs the database and applies pragmas. Because `dexieCacheStore.writeSnapshot()` uses `put`, a downloaded file with a valid SQLite header but corrupt body can overwrite the previous usable cache before `open()` fails.
- **Impact:** A bad OneDrive download can replace the last known-good offline snapshot and leave the app unable to open the cached DB on the next startup. The current tests prove that invalid headers do not overwrite the cache, but they do not cover valid-header/invalid-body corruption.
- **Recommendation:** Validate downloaded bytes by opening them with the browser DB runtime or a dedicated sql.js validation path before replacing the persisted cache. Alternatively, write downloads to a staging record and promote them only after runtime open and required pragmas succeed.

---

### Effort: Large

Findings that require more than 60 minutes, involving architectural changes, cross-cutting concerns, or significant refactoring.

_No large findings were identified. The Milestone M5 codebase is highly focused, adheres strictly to architecture boundaries, and implements all acceptance criteria in a clean, minimal design._

---

## Architecture & Design Quality Assessment

### Strengths

- **Strict Module Boundaries:** The `@db` module fully encapsulates sql.js internals and SQLite lifecycle. Feature modules depend only on typed interfaces (`AccountQueryService`, `TransferMonthQueryService`, `CategoryQueryService`) — never on raw sql.js types.
- **Deterministic Error Taxonomy:** `DbRuntimeError` with `DbRuntimeErrorCode` provides exhaustive, typed error codes that propagate cleanly through the controller → view → toast chain. The `toDbRuntimeError` normalizer preserves original `cause` for debugging.
- **Controller Pattern:** Route controllers (`accountsRouteController.ts`, `transfersRouteController.ts`) implement a clean `getState() / subscribe() / load()` contract with typed state machines, enabling both SSR rendering and unit testing via mock injection.
- **Test Architecture:** The three-tier test strategy (unit → integration → E2E) provides excellent confidence. Integration tests exercise real sql.js WASM runtimes with fixture databases. The `conspectusSchemaSnapshot.test.ts` acts as a living contract test between the PWA SQL queries and the desktop Conspectus schema.
- **E2E Mock Infrastructure:** The 2100+ line Playwright E2E suite uses layered mock injection (`installMockAuthClient`, `installMockGraphClient`, `installMockCacheStore`, `installMockDbRuntime`) that mirrors the real dependency injection pattern, providing high-fidelity behavioral testing.
- **Supersession Guard:** The `canApply` pattern in `BrowserDbRuntimeOpenOptions` is the right design for overlapping async sync operations, but it currently needs one final pre-assignment check to close a narrow stale-runtime race; see M-06.

### Minor Observations

- The `resolveAppDbRuntime()` pattern in [dbRuntimeResolver.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/features/app-shell/dbRuntimeResolver.ts) works well for E2E testing but creates a hidden coupling: the returned runtime reference must remain stable throughout the component lifecycle since query services capture it at construction time.
- The sync state machine ([syncStateStore.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/shared/state/syncStateStore.ts#L40-L47)) has well-defined allowed transitions that will throw on illegal state changes, providing excellent invariant protection.

---

## Accessibility & i18n Assessment

- **ARIA Attributes:** Account and transfer cards use `aria-busy`, `aria-live="polite"`, and `role="alert"` for error states. Month navigation buttons have proper `aria-label` attributes with localized text.
- **Keyboard Navigation:** Hash routing uses standard `<a>` elements for navigation, providing native keyboard focus and tab order. Navigation items have `:focus-visible` outline styles.
- **Touch Accessibility:** The swipe surface has an `aria-label` describing its purpose. Button elements within the swipe surface are excluded from swipe detection via `event.target.closest('button')` check.
- **i18n Coverage:** Most M5 user-visible strings are externalized to `de.json`/`en.json`, and both locale files have matching key structures. The i18n initialization defaults to `de` with English detection via `getLocaleFromNavigator()`, but locale wiring gaps remain for the transfer month header, bottom-nav landmark, and document language; see S-07, S-08, and S-09.
- **Responsive Design:** Both routes implement `@media (max-width: 380px)` breakpoints that collapse two-column card headers to single-column layouts with left-aligned amounts.
- **Reduced Motion:** Global `prefers-reduced-motion: reduce` media query in [app.css](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/app.css#L56-L65) disables transitions and animations across all components, including skeleton loading pulses.

---

## Next Milestone Readiness

### Ready

The codebase is largely prepared for **Milestone 6 (Add Transfer Write Path)**.

- **DB Write Contract:** The `@db` barrel exports `CreateTransferInput` and `CreateTransferResult` interfaces ([index.ts](file:///c:/Users/Jonas/Repositories/Conspectus-Mobile/src/db/index.ts#L59-L72)), pre-defining the write-path contract for M6 implementation.
- **Sync & Cache Architecture:** The Dexie-backed cache, in-memory SQLite runtime, and file download/validate pipeline provide the right foundation. The `browserDbRuntime.exportBytes()` method is tested and ready for upload, but the runtime/cache hardening in M-06 and M-07 should be addressed before relying on the flow for write rollback and upload recovery.
- **Upload Progress Support:** The `ProgressIndicator` component already supports a `kind='upload'` variant, and `SyncProgress` includes an `'upload'` kind. The `appSyncStateStore.updateProgress()` method accepts a `kind` parameter. i18n keys for upload progress (`uploadedKb`, `uploadProgress`) are present in both locales.
- **Strict DB Queries:** Service boundaries in the `@db` module are protected by the schema snapshot compatibility test, preventing SQL/schema drift between the PWA and the desktop Conspectus application.
- **MSAL Token Handling:** The auth module's silent-token acquisition strategy can acquire the `Files.ReadWrite` scope required for the M6 upload flow.

### Blockers or Risks

There are no blockers for Milestone 6. However, the following risks should be managed:

- **Timezone Date Selection Risks:** Form inputs for date selection in the upcoming bottom sheet must resolve dates in a UTC-safe epoch-day format rather than local timestamps, matching the query boundaries established in M5 (`getEpochDayMonthBounds` uses `Date.UTC()` throughout). Local-to-UTC conversion errors could cause day-offset drift at midnight boundaries.
- **Conflict Resolution on Upload Failure:** When database upload fails with HTTP 412 (eTag mismatch), the local SQLite instance must be re-initialized from a fresh OneDrive download, and form data must be preserved. The M6 implementation must strictly handle this rollback path using the existing supersession guard pattern.
- **Category Query Service Confidence:** The lack of a fixture-backed integration test for `categoryQueryService` (finding M-03) means that if the M6 write path modifies category associations, there is slightly lower test confidence in the category read path compared to accounts and transfers.
- **Runtime/Cache Hardening:** M-06 and M-07 are not blockers for starting M6, but they affect the exact startup/cache invariants that the write path will depend on after a local DB mutation and conditional upload attempt.
- **Locale and Accessibility Polish:** S-07, S-08, and S-09 should be cleaned up before M6 adds more form controls and validation surfaces, otherwise future screens will inherit inconsistent language metadata.

---

## Summary

| Effort    | Count | Critical | High | Medium | Low | Invalidated | Solved |
| --------- | ----- | -------- | ---- | ------ | --- | ----------- | ------ |
| Small     | 11    | 0        | 0    | 1      | 5   | 0           | 5      |
| Medium    | 7     | 0        | 0    | 4      | 2   | 1           | 0      |
| Large     | 0     | 0        | 0    | 0      | 0   | 0           | 0      |
| **Total** | 18    | 0        | 0    | 5      | 7   | 1           | 5      |
