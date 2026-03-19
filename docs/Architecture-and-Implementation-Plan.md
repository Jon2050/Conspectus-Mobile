# Conspectus-Mobile - Architecture and Implementation Plan

## 1. Purpose and Scope

This document is the deep source-of-truth for architecture decisions, sync/write behavior, and milestone delivery for **Conspectus-Mobile**.

Use `README.md` as the quick-entry document for goal, MVP/non-goal summary, local setup, environment variables, and module import conventions.

Core product constraints remain:

- OneDrive-hosted personal SQLite file per user.
- No backend server.
- No required desktop-app changes.
- Simple, maintainable mobile-first implementation.

## 1.1 Documentation Ownership

Canonical sections by topic:

- Sync/caching model (`eTag`, `If-Match`, conflict recovery): this document, `## 3.4 Sync and Caching Strategy`.
- Environment variable definitions/defaults: `README.md`, `## Environment Setup`.
- Entra app registration contract (SPA account type + redirect URIs): `docs/auth/Entra-App-Registration.md`.
- Module import conventions and aliases: `README.md`, `## Architecture Modules`.

---

## 2. Confirmed Constraints and Product Decisions

- Account type support: **Microsoft personal accounts only**.
- Platform: **PWA**, no native iOS/Android apps.
- Backend: **none** (frontend-only).
- Hosting: `https://jon2050.de/conspectus/webapp` (HTTPS available).
- OneDrive file selection: ask once, store binding locally.
- Settings must include local reset/rebind option.
- Offline mode: **viewing only** using cached last DB.
- Offline add transfer: **not supported**.
- File transport: raw `.db` only.
- Keep source code small and simple.
- Separate repository (`Conspectus-Mobile`) from main desktop Conspectus repo.

---

## 3. High-Level Architecture

## 3.1 Technology Stack

- Framework: **Svelte + TypeScript + Vite**
- PWA: **vite-plugin-pwa** (service worker + manifest)
- Auth: **@azure/msal-browser** (Authorization Code + PKCE)
- OneDrive API: **Microsoft Graph REST**
- SQLite in browser: **sql.js** (WASM)
- Local cache: **IndexedDB** via **Dexie**
- Testing: **Vitest**, **Playwright**, ESLint, Prettier

Rationale:

- Minimal runtime and code size.
- Strong mobile performance.
- Simple deployment (static assets only).

## 3.2 Runtime Components

1. `UI Layer`

- Mobile-first screens and components.
- Gesture handling for month swipe.
- Online/offline state and sync status indicators.

2. `Auth Module`

- Sign in/out with MSAL.
- Silent token acquisition where possible.
- Controlled fallback to interactive login.

3. `OneDrive/Graph Module`

- Metadata fetch (`driveId`, `itemId`, `eTag`).
- File download and full-file upload.
- Conditional upload using `If-Match` eTag.

4. `DB Engine Module`

- Open DB bytes in sql.js.
- Run read queries for accounts/transfers.
- Run write transaction for add-transfer flow.
- Export updated DB bytes for upload.

5. `Local Cache Module`

- Persist DB blob + metadata (`eTag`, file IDs, last sync).
- Provide offline read when network unavailable.

6. `App State Module`

- Selected month.
- Sync lifecycle states.
- Cached file identity (including fallback path/name) and sync metadata state.

## 3.3 Data Model Parity

The PWA must mirror desktop behavior for transfer creation:

- Insert into `transfer`.
- Update both affected `account.amount` values.
- Use same field-level validation rules as desktop:
  - name length > 2
  - amount > 0
  - account combination constraints

## 3.4 Sync and Caching Strategy

This section is the canonical sync behavior definition for the repository.

Read flow on app startup:

1. Resolve user auth.
2. Resolve stored file binding (`driveId`, `itemId`, `parentReference/path`, `name`).
3. Fetch file metadata (including `eTag`).
4. If cached blob exists and eTag unchanged, load cached DB.
5. Else download full DB, cache it, and load it.

Cache loss is non-critical: if the local IndexedDB cache is evicted (e.g. by iOS after inactivity), the app simply re-downloads the DB from OneDrive on next online startup. No data is lost because OneDrive is always the authoritative source.

Write flow for "Add Transfer":

1. Require online state.
2. Validate fields.
3. Execute local SQL transaction.
4. Export full DB bytes.
5. Upload full DB with `If-Match: currentETag`.
6. Cache uploaded DB and returned new eTag.

Conflict policy:

- User agreement says desktop and mobile won't be used concurrently.
- Still keep eTag conditional upload for protection.
- If an eTag conflict occurs, the in-memory `sql.js` database instance MUST be completely destroyed and re-initialized with the freshly downloaded bytes before the user is allowed to retry the transfer save.

Data recovery:

- OneDrive automatically keeps version history for uploaded files (30 days for personal accounts).
- Every PWA upload creates a recoverable version in OneDrive.
- If a write corrupts data or the user makes a mistake, previous versions can be restored via OneDrive's web UI.
- No custom backup mechanism is needed in the PWA.

## 3.5 Performance and Data Traffic

Given ~700 KB DB:

- First load per device/profile: ~700 KB download.
- Each successful save: ~700 KB upload.
- Unchanged open: metadata check only, no full download.

Optimization strategy (simple):

- Cache DB locally.
- Avoid background polling.
- Manual/foreground sync triggers.
- Optional `VACUUM` cadence (e.g., every N writes) to keep DB size compact.

Compression note:

- No backend means no practical custom compressed transport pipeline.
- OneDrive stores bytes as uploaded; raw `.db` is the supported path here.

---

## 4. UX and Visual Design Direction

## 4.1 Design Principles

- Fast, touch-first, one-handed usage.
- Clear hierarchy and low cognitive load.
- Financial data legibility first.
- Modern look with subtle motion and high clarity.

## 4.2 Visual System (aligned with desktop colors)

Base palette derived from desktop CSS:

- App background: `#dcdcdc`
- Card/surface: `whitesmoke`
- Positive text: `#38a673`
- Negative text: `#fa2828`
- Neutral text: `dimgrey`
- Accent interaction (swipe/highlight): cyan/teal family

Typography:

- Clean modern sans-serif stack with readable numeric rendering.

Core UI patterns:

- Bottom navigation (Accounts, Transfers, Add, Settings).
- Floating primary action for quick add.
- Bottom-sheet form for adding transfer.
- Swipe month navigation with fallback arrow controls.

## 4.3 Accessibility and Mobile Usability

- Minimum 44x44px tap targets.
- Sufficient contrast for money values and action states.
- Keyboard-safe form interactions.
- Explicit loading and error states.
- Reduced-motion compatibility.
- Native feel via `viewport-fit=cover` and CSS safe-area insets (`env(safe-area-inset-bottom)`) to prevent notch/home bar overlap.
- Explicit Apple touch icons for Add to Home Screen.

## 4.1 Advanced Mobile UI Patterns

To ensure a continuous "native-app" feel throughout upcoming milestones, the application implements the following unified patterns via `@shared/components` (`src/features/app-shell/components`):

- **Zero-Dependency Motion:** Route and list changes MUST utilize standard Svelte `fly`, `fade`, and `slide` transitions instead of third-party animation libraries.
- **Transient Feedback (Toasts):** Background sync operations (M4, M6) MUST surface non-blocking feedback via `appToastStore` (e.g., `appToastStore.show('Syncing...', 'info')`) to avoid interrupting user flows.
- **Contextual Data Entry (Bottom Sheet):** The core "Add Transfer" flow (M6) MUST utilize the `<BottomSheet />` component (a styled standard `<dialog>`) rather than a full page route to keep the user anchored to their context.
- **Perceived Performance (Skeleton Loading):** Fetch operations involving SQL or Graph API MUST render `<SkeletonCard />` components instead of spinning circles during the initial data load.
- **System Dark Mode:** The app uses `@media (prefers-color-scheme: dark)` in `app.css` to automatically map base color variables to a dark slate equivalent. No manual toggle is required.
- **Mobile Input Zoom Prevention:** All inputs MUST use the `.app-input` utility class which binds `font-size: 16px` to prevent automatic zoom behavior on iOS Safari.
- **End-of-Page Deployment Info:** The app shell exposes a shared, non-sticky footer bar at the end of each primary page that shows `Ver. <version> <date> <time>`. Runtime metadata is resolved through a shared build-info provider: production prefers `deploy-metadata.json.buildTimeUtc`, while preview/local builds use injected deterministic build metadata so the footer remains available offline without backend calls.

---

## 5. Detailed Implementation Plan (Milestones)

## Milestone 1: Foundation (Repo + Tooling)

Goal: create a clean, production-ready technical baseline.

Substeps:

1. Use repository `Conspectus-Mobile`.
2. Bootstrap Svelte + TS + Vite project.
3. Add lint/format/typecheck scripts.
4. Add `vite-plugin-pwa` and baseline manifest:
   - name/short_name
   - icons
   - standalone mode
   - theme color
5. Add environment config strategy:
   - `VITE_AZURE_CLIENT_ID` (definition/defaults are maintained in `README.md`)
6. Create base architecture folders:
   - `src/auth`
   - `src/graph`
   - `src/db`
   - `src/cache`
   - `src/features`
   - `src/shared`
7. Set CI workflow:
   - install
   - typecheck
   - lint
   - unit tests
   - build

Deliverables:

- Compilable app shell.
- PWA install prompt possible.
- CI green on main branch.

Exit criteria:

- App builds and runs on localhost and on test hosting path.
- Lint/typecheck/test/build scripts all pass.

---

## Milestone 2: Website Integration + Early Deploy

Goal: integrate the PWA into the existing static website as early as possible for real-device testing.

Substeps:

1. Define deployment channel architecture (M2-00 foundation):
   - branch preview channel on GitHub-hosted URLs for every branch push after `Quality` passes
   - main-only production channel for `jon2050.de` deployment eligibility
   - fixed preview path slots:
     - `main` branch -> `/previews/main/`
     - every non-`main` branch -> `/previews/test/`
2. Confirm final public route:
   - `jon2050.de/conspectus/webapp/`
3. Configure Vite/PWA build paths per channel:
   - preview: fixed-slot base path and `start_url` (`/previews/main/` or `/previews/test/`)
   - production: `/conspectus/webapp/` base path and `start_url`
   - service worker scope isolation for both channels
4. Add deploy target structure compatible with existing website static hosting.
5. Add minimal "PWA shell smoke" page to verify:
   - app route loads under website path
   - service worker registration works
   - manifest and icons resolve correctly
   - e2e smoke asserts production base-path manifest fields (`start_url`, `scope`) and that parent-site routes outside app scope are not service-worker-controlled
6. Add website navigation entry/link to the PWA route (or temporary test link).
7. Add CI deployment workflows:
   - `Deploy Preview` workflow runs from successful `Quality` push runs (`workflow_run`)
   - publish/update preview on successful branch builds:
     - `main` branch updates `/previews/main/`
     - non-`main` branches update `/previews/test/`
   - keep production website rollout manual in this repository via `Deploy Production`, which requires a successful `Quality` run for the current `main` commit, rebuilds the production variant, publishes the immutable production handoff artifact, and dispatches the website repo
   - run build-output path/scope assertions in `Quality` for preview and in `Deploy Production` for production so each channel is validated at its own deployment boundary
8. Verify production installability contract (`M2-07`):
   - enforce install icon contract in automated checks (`manifest` includes moneybag `192x192` and `512x512`, HTML includes moneybag `apple-touch-icon`)
   - keep manual iOS Safari / Android Chrome Add to Home Screen checklist and evidence in GitHub issue [#25](https://github.com/Jon2050/Conspectus-Mobile/issues/25)
   - track discovered installability defects as `bug` issues (current follow-up: icon cropping/centering issue `#106`)

Deliverables:

- Publicly reachable PWA shell on `jon2050.de` for iOS/Android testing.
- Repeatable early deploy process independent of feature completion.
- Fixed preview URLs for development and QA (`/previews/main/` and `/previews/test/`).
- Main-only production artifact handoff contract for website deployment.
- Installability verification record with explicit bug-tracking linkage.

Exit criteria:

- Successful `main` pushes update `/previews/main/`; successful non-`main` pushes update `/previews/test/`.
- PWA opens correctly at `https://jon2050.de/conspectus/webapp/`.
- Install prompt/service worker/manifest behavior is testable on mobile devices.
- Successful manual production deploy runs from `main` produce traceable production artifacts for website consumption.

---

## Milestone 3: Auth + OneDrive File Binding

Goal: user can authenticate and bind a DB file once.

Substeps:

1. Register Entra app for SPA redirect flow (personal accounts).
2. Configure redirect URIs:
   - `https://jon2050.de/conspectus/webapp/` (production)
   - `http://localhost:5173/` (local development)
3. Implement MSAL bootstrapping and login state store.
4. Implement sign-in and sign-out UX.
5. Implement OneDrive file picker/select flow (or Graph file browse fallback).
6. Persist selected file binding in IndexedDB/local storage:
   - `driveId`
   - `itemId`
   - file display name and `parentReference` (path) for fallback recovery
7. Add settings actions:
   - "Change DB file"
   - "Reset local app data"

M3 sequencing note:

- `M3-01` defines the app registration contract (`docs/auth/Entra-App-Registration.md`) and is required before `M3-02` (Graph scopes) and `M3-03` (MSAL bootstrap implementation).

M3-03 implementation clarification:

- Auth bootstrap is implemented in `src/auth/msalAuthClient.ts` and exposed through `@auth` as `createAuthClient`.
- Login/logout interactive actions use MSAL redirect flow (`loginRedirect`/`logoutRedirect`) with personal-account authority (`https://login.microsoftonline.com/consumers`).
- Startup initialization restores active account in deterministic order:
  1. account returned by `handleRedirectPromise()`
  2. currently active account in MSAL cache
  3. deterministic fallback from cached accounts (username + homeAccountId sort)
- Access token acquisition uses a silent-first strategy (`acquireTokenSilent`) and normalizes failures into stable app-level auth error codes (`interaction_required`, `network_error`, `no_active_account`, etc.).

M3-04 implementation clarification:

- Sign-in/sign-out UX is implemented in `src/features/app-shell/routes/SettingsRoute.svelte` and wired to `@auth` via `createSettingsAuthController`.
- Redirect-response auth bootstrap is also triggered at app-shell startup (`src/features/app-shell/AppShell.svelte`) so `handleRedirectPromise()` runs before hash-route navigation can discard redirect fragments.
- Settings auth UI includes explicit pending/success/error states and a signed-in account summary (`displayName`, `username`, `homeAccountId`).
- Controller operations are initialization-safe: `signIn`/`signOut` trigger auth initialization first when needed and block duplicate in-flight actions.
- E2E auth mocking is enabled only on localhost hosts (`127.0.0.1`/`localhost`) used by Playwright; production hosts always use the real auth client.
- Platform verification is covered by Playwright Chromium + Pixel 5 by default, with optional iPhone WebKit runs enabled through `PLAYWRIGHT_INCLUDE_IOS_WEBKIT=1`.

M3-05 implementation clarification:

- Graph access is implemented in `src/graph/graphClient.ts` and exposed through `@graph` as `createGraphClient`.
- The client centralizes the MVP Graph operations needed by upcoming milestones: file metadata, raw file download, and conditional full-file upload.
- Every Graph request acquires a bearer token from `@auth` using `GRAPH_ONEDRIVE_FILE_SCOPES`, keeping MSAL details out of the graph module surface.
- Graph/auth failures are normalized into stable app-level graph error codes (`unauthorized`, `forbidden`, `not_found`, `conflict`, `network_error`, `unknown`) for UI and sync-layer handling.

M3-06 implementation clarification:

- OneDrive DB file browsing/selection is implemented in `src/features/app-shell/routes/settingsFileBindingController.ts` and `src/features/app-shell/routes/SettingsRoute.svelte`.
- The Settings flow uses the Graph client browse surface (`listChildren`) to open the root folder and navigate child folders without adding an external picker dependency.
- The file browser surfaces folders plus `.db` files only, and validated selections return `driveId`, `itemId`, `name`, and `parentPath` for later persistence/recovery work.
- File selection state is session-local in M3-06; durable storage of the selected binding remains scoped to `M3-07`.

M3-07 implementation clarification:

- Durable file binding persistence is implemented in `src/shared/state/selectedDriveItemBindingStore.ts` with schema-versioned local metadata payloads (`version` field).
- Current payload schema stores bindings per authenticated account (`bindingsByAccountId`) so account switches do not overwrite previously persisted bindings for other accounts on the same device/profile.
- Startup binding hydration is triggered at app initialization in `src/features/app-shell/AppShell.svelte` and synchronized through `src/features/app-shell/startupBindingSync.ts`, so the active account binding is resolved before entering Settings.
- Legacy persisted payloads from pre-versioned and v1 single-binding formats are migrated on read into the current schema during hydration.

M3-08 implementation clarification:

- Settings now exposes explicit DB rebind and local reset actions in `src/features/app-shell/routes/SettingsRoute.svelte`: `Change DB file` (when a binding exists) and `Reset local app data`.
- Destructive local reset behavior is orchestrated by `src/features/app-shell/routes/settingsLocalDataController.ts` with explicit confirmation state, in-flight protection, and surfaced failure messaging.
- Reset execution is wired through `src/features/app-shell/routes/settingsCacheStoreResolver.ts`, which clears app-owned local storage/session storage keys, service-worker cache entries with `conspectus` naming, and IndexedDB databases matching `conspectus` before binding removal completes.
- The reset confirmation is rendered as a modal `dialog` and blocks sign-out/reset/rebind controls while confirmation or reset is active to prevent account-context race conditions during binding clearance.

M3-09 implementation clarification:

- Auth and binding integration coverage is implemented in `tests/e2e/app-shell.spec.ts` and validated in CI through `npm run test:e2e`.
- Core browser-level scenarios now include sign-in/sign-out settings flow, selected DB binding persistence across reload, and startup restoration of an existing binding on non-settings routes.
- Failure-mode coverage includes token acquisition failure during OneDrive browse (surfaces binding error UI) and malformed `.db` selection (surfaces validation error and prevents false success state).

Deliverables:

- Stable login flow with persisted session where possible.
- One-time DB file binding retained across app restarts.

Exit criteria:

- User can reopen app and access same file without reselecting.
- Reset clears binding and forces fresh selection.

---

## Milestone 4: Sync Engine + Local Cache (Offline Read)

Goal: robust online/offline read behavior with minimal traffic.

Substeps:

1. Implement Graph metadata fetch for current file.
2. Implement eTag-based freshness decision.
3. Implement DB blob download and cache persist.
4. Implement cache schema:
   - db bytes
   - `eTag`
   - `lastSyncAt`
   - file identifiers (`driveId`, `itemId`, `path`, `name`)
5. Implement startup decision tree:
   - online + unchanged => cached DB
   - online + changed => download
   - offline => cached DB if present
6. Add sync state UI:
   - synced
   - stale
   - offline
   - syncing
   - error
7. Add robust retry strategy with exponential backoff for transient failures.

M4-01 implementation clarification:

- The local cache schema is implemented as a single Dexie-backed IndexedDB database named `conspectus-mobile-cache`.
- Schema version `1` uses separate tables for cached DB bytes and sync metadata, both keyed by the bound file identity (`driveId` + `itemId`).
- Future cache schema updates must add a new Dexie version block with an explicit migration step instead of changing version `1` in place.
- `src/features/app-shell/routes/settingsCacheStoreResolver.ts` must close active Dexie connections before calling `indexedDB.deleteDatabase(...)` so local reset cannot be blocked by the open cache connection.

M4-02 implementation clarification:

- Graph metadata fetch is implemented in `src/graph/graphClient.ts` and exposed through `@graph` as `getFileMetadata`.
- The metadata request selects `eTag`, `size`, and `lastModifiedDateTime` for the bound OneDrive item and normalizes them into the public `GraphFileMetadata` contract.
- Metadata payload validation rejects missing, blank, or otherwise malformed `eTag`/timestamp fields plus invalid file sizes before the data is allowed into later sync decisions.
- Metadata fetch failures are normalized into the existing Graph error categories (`unauthorized`, `forbidden`, `not_found`, `conflict`, `network_error`, `unknown`) so later sync-state work can branch deterministically on stable error codes.

M4-03 implementation clarification:

- File download plus cache persistence is implemented in `src/features/app-shell/cachedDatabaseSnapshotService.ts` as a small orchestration service above `@graph` and `@cache`.
- Successful cache writes require three integrity checks on the downloaded payload before `writeSnapshot(...)` is allowed to run: non-empty metadata/file size, exact byte-length match with Graph `sizeBytes`, and the standard SQLite file header (`SQLite format 3\0`).
- Invalid downloads fail closed and do not overwrite an existing cached snapshot, which keeps later startup freshness decisions deterministic for `M4-04`.

M4-04 implementation clarification:

- Startup freshness resolution is implemented in `src/features/app-shell/startupFreshnessService.ts` and invoked during app-shell startup from `src/features/app-shell/AppShell.svelte`.
- The service emits deterministic result branches for the core decision tree: no binding, online unchanged (`eTag` match), online changed (`eTag` mismatch => re-download), offline with cache, and offline without cache.
- When startup metadata refresh or snapshot download fails while a cached snapshot exists, the current implementation resolves a `stale` startup state and continues with the cached bytes instead of clearing auth/binding state.
- Development-only telemetry for startup freshness branches is emitted from `AppShell.svelte` so branch selection and fallback/error outcomes remain inspectable without adding production logging noise.

M4-05 implementation clarification:

- The app-wide sync status state machine is implemented in `src/shared/state/syncStateStore.ts` and exposed as `appSyncStateStore` for cross-route consumers such as the app shell and upcoming Settings work.
- Legal transitions are enforced in the store itself so UI code cannot jump directly from `idle` to terminal success states without first entering `syncing` when an online startup refresh is actually running.
- Startup-specific sync status orchestration lives in `src/features/app-shell/startupSyncStateController.ts`, which maps `startupFreshnessService` decisions into a single visible UI state/message and emits non-blocking toast feedback through `appToastStore`.
- Browser coverage for the new `syncing` state and toast-based background feedback is implemented in `tests/e2e/app-shell.spec.ts`, while unit coverage verifies guarded transitions and startup decision mapping.

M4-06 implementation clarification:

- Transient startup sync retries are implemented inside `src/features/app-shell/startupFreshnessService.ts`, not in UI code, so metadata refresh and fresh-snapshot download both share the same capped exponential backoff behavior.
- Retryability is intentionally narrow: only normalized Graph `network_error` failures are retried; auth, permission, not-found, conflict, and local snapshot validation failures still fail fast on the first attempt.
- The default startup retry policy is 3 total attempts with a `250ms` base delay capped at `1000ms`; when retries are exhausted, the final failure preserves the normalized `network_error` identity for later handling and surfaces actionable user messaging.
- When retries are exhausted but a cached snapshot already exists, startup still resolves to the existing `stale` branch and continues with the cached DB instead of discarding readable local data.

M4-07 implementation clarification:

- Sync/cache regression coverage is split intentionally across service-level Vitest tests in `src/features/app-shell/startupFreshnessService.test.ts` and browser-level Playwright scenarios in `tests/e2e/app-shell.spec.ts`.
- The automated coverage now includes the full startup decision matrix plus retry exhaustion behavior for both metadata refresh and fresh-snapshot download branches, including cached stale fallback and terminal error outcomes.
- Offline startup behavior remains covered in Playwright for both cache-hit and cache-miss paths so CI catches regressions in the app-shell orchestration, not only in isolated service mocks.

M4-08 implementation clarification:

- Progress reporting for large `downloadFile` operations is implemented via `response.body.getReader()` to stream chunks while incrementally updating a total byte counter.
- Because `fetch` does not support upload progress natively, `uploadFile` progress is implemented using a seamless fallback to `XMLHttpRequest` that preserves the existing `GraphClientError` normalization, metadata requirements, and authorization header logic.
- Startup download progress is threaded through `startupFreshnessService` and surfaces in `AppShell.svelte` when the app sync state store is in the `syncing` phase.
- The user-visible upload-progress indicator is not part of the shipped M4 UI because the transfer save flow does not exist until Milestone 6. The current `uploadFile` progress callback is transport-layer groundwork that MUST be consumed and covered by integration/E2E tests when the M6 add-transfer write path is implemented.

Deliverables:

- Reliable DB availability for read-only mode offline.
- Minimal repeated data transfers.

Exit criteria:

- Airplane mode still shows cached accounts/transfers.
- Online resume refreshes when eTag changed.

---

## Milestone 5: Accounts and Transfers Read UX

Goal: deliver high-quality fast browsing experience.

Substeps:

1. Implement account query:
   - visible account set
   - sorted order consistent with DB fields
2. Build Accounts screen cards:
   - account name
   - amount with positive/negative styling
3. Implement month state model:
   - default current month
   - previous/next month controls
   - swipe gesture handlers
4. Implement transfer query by month bounds using epoch-day logic.
5. Build Transfers list UI:
   - date, name, amount, from/to, categories
   - empty-state card
6. Add loading skeletons and micro-animations.
7. Performance tuning:
   - avoid unnecessary re-query/re-render
   - memoize derived values where useful

M5-01 implementation clarification:

- The browser DB runtime now uses `sql.js` WASM with a dedicated loader (`src/db/sqlJsLoader.ts`) and singleton runtime service (`src/db/browserDbRuntime.ts`) exposed through `@db`.
- Startup sync now opens cached/downloaded snapshot bytes into the runtime after freshness resolution and closes the runtime deterministically when startup fails or no binding is selected.
- Open operations are guarded against superseded startup runs to prevent stale in-memory DB state during overlapping startup/rebind operations.
- Required DB initialization pragma is applied on open (`PRAGMA foreign_keys = ON`) and validated before runtime consumers can execute queries.
- DB runtime errors are normalized into stable codes (`DbRuntimeErrorCode`) and mapped to deterministic startup error messages in app-shell state handling.
- CSP contract now explicitly includes `script-src 'wasm-unsafe-eval'` for sql.js WASM execution, and build-channel verification enforces this contract.

M5-02 implementation clarification:

- Account query access for the upcoming Accounts screen is implemented in `src/db/accountQueryService.ts` and exposed through `@db` as `createAccountQueryService`/`appAccountQueryService`.
- The query mirrors desktop parity for list scope by selecting only visible non-primary accounts (`visible = 1` and `ac_type_id NOT IN (1, 2)`).
- Deterministic ordering is enforced in SQL (`ac_order ASC`, `LOWER(name) ASC`, `account_id ASC`) so equal-name/equal-order rows remain stable across executions.
- Query result mapping fails closed with `db_query_failed` when result columns or value types do not match the expected `AccountRecord` shape, preventing runtime parsing drift from leaking into UI consumers.
- Regression coverage for the service includes valid filter/sort behavior plus malformed result-shape/type scenarios in `src/db/accountQueryService.test.ts`.

Deliverables:

- Production-ready viewing experience for accounts and monthly transfers.

Exit criteria:

- Month switching feels immediate on modern phones.
- Lists remain usable and readable on narrow screens.

---

## Milestone 6: Add Transfer Write Path

Goal: safe and desktop-compatible transfer creation.

Substeps:

1. Build "Add Transfer" bottom sheet form:
   - date
   - name
   - amount
   - from account
   - to account
   - up to 3 categories
   - buyplace (optional)
2. Implement desktop-equivalent validations.
3. Implement SQL write transaction:
   - insert transfer row
   - update source account amount
   - update target account amount
4. Refresh in-memory views after successful write.
5. Export DB bytes and upload with `If-Match`.
6. Handle upload failures:
   - show failure state
   - keep form data for retry
   - do not pretend success
7. Show clear visual success message upon successful upload completion.
8. Block offline writes:
   - detect missing internet connection
   - disable save button and show prominent offline warning message
9. Optional maintenance toggle:
   - run `VACUUM` every N writes or manual trigger in settings.

Deliverables:

- End-to-end write feature with clear success/error behavior.

Exit criteria:

- Created transfer appears immediately in PWA.
- Desktop app later sees same transfer after OneDrive sync.

---

## Milestone 7: Settings, Recovery, and Operational Safety

Goal: make small app self-maintainable by end users.

Substeps:

1. Settings page sections:
   - bound OneDrive file info
   - last sync timestamp
   - app version/build
2. Actions:
   - change file
   - reset local cache
   - force refresh from OneDrive
3. Safety notice card:
   - "Do not use mobile app while desktop app is open"
4. Error recovery UX:
   - re-login flow
   - stale token handling
   - missing file handling (moved/deleted)
5. Add simple diagnostics panel (copyable text for support):
   - auth state
   - network state
   - file ID presence
   - last error code

Deliverables:

- Clear operational controls and troubleshooting path.

Exit criteria:

- User can recover from wrong file binding without developer help.

---

## Milestone 8: Hardening, QA, and Release

Goal: release with confidence on iOS and Android.

Substeps:

1. Security hardening:
   - strict CSP
   - no secrets in frontend
   - dependency audit
2. Performance hardening:
   - Lighthouse checks
   - bundle size budget
3. E2E smoke suite for critical paths.
4. Manual device matrix testing.
5. Release checklist and rollback plan.
6. Deploy pipeline to production path.

Deliverables:

- Release candidate and production deployment.

Exit criteria:

- All release gates green and smoke tests pass on both platforms.

---

## 6. Quality Strategy (QS) and Testing Strategy

## 6.1 Quality Objectives

- Correctness of financial writes.
- Safe sync behavior with transparent state.
- Strong mobile usability.
- Predictable behavior in unstable network conditions.

## 6.2 Test Pyramid

1. Unit tests (high volume, fast)

- Validation rules.
- Month boundary calculations.
- SQL builder/helpers.
- Cache freshness decision logic.

2. Integration tests (medium)

- DB module + sql.js with fixture DB.
- Graph client wrappers with mocked responses.
- Auth state transitions.

3. End-to-end tests (focused)

- Login flow (mocked tokens in CI if needed).
- File binding and app restart persistence.
- View accounts and month transfers.
- Add transfer happy path and failure/retry path.
- Offline startup with cache.

## 6.3 Test Data and Fixtures

- Maintain small fixture DBs:
  - baseline production-like schema/data
  - empty/month-heavy data
- Include deterministic transfer/account sets for assertion stability.

## 6.4 Manual Device Test Matrix

Required minimum:

- iPhone Safari (latest iOS)
- Android Chrome (latest stable)

Recommended additional:

- iPad Safari
- Samsung Internet (recent)

Manual scenarios:

- Install to home screen.
- App reopen after token expiration.
- Network drops during upload.
- Swipe gestures + fallback controls.
- Settings reset/rebind flow.

## 6.5 Regression and Release Gates

Hard gates before release:

1. Unit/integration/e2e suites pass.
2. Typecheck and lint pass.
3. Bundle size within budget.
4. No high severity dependency vulnerabilities.
5. Manual device smoke tests pass.

## 6.6 Observability and Error Handling

- Structured client logs in dev mode.
- User-facing error messages with actionable text.
- Internal error codes for support troubleshooting.
- Non-blocking telemetry optional; avoid complexity for MVP.

---

## 7. Security and Privacy Strategy

- SPA auth with PKCE via MSAL.
- Delegated Graph scopes only; least privilege.
- Approved MVP scope baseline (`openid`, `profile`, `offline_access`, `Files.ReadWrite`) is maintained in `docs/auth/Entra-App-Registration.md` (M3-02 source of truth).
- No client secret in frontend code.
- HTTPS-only deployment.
- MFA recommended/required on both Microsoft accounts.
- Store only minimal local metadata and cached DB necessary for offline read.
- Provide explicit logout and local reset options.

---

## 8. Deployment and Repository Strategy

## 8.1 Separate Repo + Website Integration

Recommended:

1. Keep `Conspectus-Mobile` as independent git repository.
2. Use dual deployment channels:
   - branch previews hosted from this repo on GitHub paths for development validation
   - main-only production artifact handoff for website deployment
3. Build and deploy static output directly to:
   - `jon2050.de/conspectus/webapp/`
4. Keep website repo independent; add simple link to PWA route.

Rejected alternatives for MVP (authoritative decision is section `8.3`):

- Git submodule with website-side build/copy steps.
- Git subtree syncing of mobile source into website repository.
- Package-registry pull flow for static assets.

## 8.2 CI/CD

Pipeline stages:

1. Build/test on push.
2. `Quality` uploads the reusable preview `dist` artifact only when code changes require the heavy jobs.
3. `Deploy Preview` listens to successful `Quality` push runs only and deploys fixed preview slots on `gh-pages` paths:
   - `/previews/main/` for `main`
   - `/previews/test/` for non-`main` branches.
4. `Deploy Production` is started manually from `main`, requires a successful `Quality` run for the current `main` commit, builds and verifies the production `dist`, adds deployment metadata, publishes one immutable production artifact, dispatches the website repository, and runs production smoke checks against the live site.
5. Website repo consumes the production artifact from `Deploy Production` and deploys to `jon2050.de/conspectus/webapp/`.
6. GitHub Pages also runs a GitHub-managed `pages-build-deployment` workflow when the `gh-pages` branch is published; this repository does not own or rename that workflow.

## 8.3 Approved Cross-Repo Deployment Architecture (M2-01)

Decision status:

- Approved for MVP Milestone 2.
- Selected strategy: artifact handoff (PWA repo produces immutable build artifacts; website repo consumes artifacts in CI).

Options reviewed:

- Artifact handoff (selected): clean repo separation, immutable versioned outputs, simple rollback to known-good artifact, no cross-repo working-tree coupling.
- Submodule (rejected): pins source code commit, not compiled output; adds submodule update overhead and failure modes that are unrelated to deployment correctness.
- Subtree (rejected): duplicates source history into website repo and increases merge/maintenance complexity for routine deploys.
- Package pull (rejected for MVP): adds package publish/registry lifecycle that is unnecessary for static-site artifact delivery.

Producer/consumer CI contract (automation-only, no manual copy):

1. Producer (`Conspectus-Mobile`):
   - `Quality` is the only build/test gate and produces the reusable preview `dist` artifact for downstream preview deploys and E2E smoke tests.
   - Source workflow for the immutable production handoff artifact: `Deploy Production` after a successful `Quality` run for the current `main` commit.
   - Production artifact is published only from manual `main` deploy runs.
   - Every successful production deploy run MUST emit exactly one deployable production artifact; the producer workflow enforces this before handoff dispatch.
   - Artifact name format: `conspectus-mobile-production-<commitSha>`.
   - Artifact payload is `dist/` and MUST include `deploy-metadata.json` with:
     - `channel` (`production`)
     - `basePath` (`/conspectus/webapp/`)
     - `sourceBranch`
     - `commitSha`
     - `buildTimeUtc`
     - `qualityRunId`
     - `deployRunId`
   - Deterministic handoff event to website repo is triggered manually from `Deploy Production` after the production build and artifact publication succeed:
     - Trigger `repository_dispatch` with event type `conspectus-mobile-production-ready`.
     - Payload MUST include `commitSha`, `deployRunId`, `qualityRunId`, and `artifactName`.
     - Producer dispatch token MUST be scoped to trigger workflow events in the website repository.
     - Producer workflow secret `WEBSITE_REPO_DISPATCH_TOKEN` is required for contract verification and dispatch.
     - Producer workflow variable `WEBSITE_REPO_FULL_NAME` may override the default consumer target (`Jon2050/Jon2050_Webpage`).
   - Post-deploy production smoke checks MUST run inside `Deploy Production` after the handoff dispatch succeeds.
   - Smoke checks MUST target the production app base URL (`https://jon2050.de/conspectus/webapp/` by default; override via `PRODUCTION_APP_BASE_URL` repository variable), fail closed, verify deployed `deploy-metadata.json` identity fields (`commitSha`, `deployRunId`) against expected handoff context, and include deploy identity context in logs.
2. Consumer (website repository):
   - Trigger on `repository_dispatch` (`conspectus-mobile-production-ready`) and read payload fields as the single source of artifact identity.
   - Resolve artifact deterministically via GitHub Actions API using `deployRunId`:
     - List artifacts for that run and select exact `artifactName`.
     - Download artifact archive from the same run.
   - Consumer token MUST have `actions:read` access to `Conspectus-Mobile` artifacts.
   - Validate `deploy-metadata.json` before publish (channel is `production`, base path is `/conspectus/webapp/`, identity fields present).
   - Validate identity match (`deploy-metadata.commitSha == dispatch.commitSha`, `deploy-metadata.deployRunId == dispatch.deployRunId`).
   - Perform atomic replace of website output directory `conspectus/webapp/` from the artifact contents.
   - Fail deployment if artifact download or metadata validation fails.
   - Implementation note (M2-04): consumer automation is implemented in website repo workflow `.github/workflows/deploy.yml` on branch `master` in `Jon2050/Jon2050_Webpage`, with metadata validation script `scripts/validate-conspectus-deploy-metadata.mjs`.
   - Consumer credential note (M2-04): website repo secret `CONSPECTUS_MOBILE_ARTIFACT_TOKEN` must provide `actions:read` access to `Jon2050/Conspectus-Mobile` artifacts.

Failure and rollback behavior:

1. If producer artifact generation fails, website deployment does not run for that revision.
2. If consumer artifact retrieval or validation fails, website deployment fails without changing live files.
3. Rollback re-deploys the last known-good `deployRunId` artifact via consumer CI automation by replaying the `repository_dispatch` handoff payload with known-good identity fields; rollback must use CI automation only (no manual filesystem copy steps).
4. Operator runbook history for M2 is maintained in GitHub issue [#27](https://github.com/Jon2050/Conspectus-Mobile/issues/27); expanded rollback coverage remains tracked in `M8-09`.

---

## 9. Future Feature Outlook: Receipt Scan and Auto-Split

MVP status: concept only.

Option A (no-cost local-first):

- Capture receipt image in browser.
- Run OCR on-device (`tesseract.js`).
- Extract totals/date/vendor with heuristics.
- Suggest prefilled transfer form.

Option B (better extraction, possible free tier limits):

- Cloud OCR/vision API then parse/classify lines.
- Suggest category-based split into multiple transfers.

Auto-split concept:

1. Parse line items.
2. Classify by keyword/category mapping.
3. Group into transfer candidates.
4. User confirms/edits before save.

Privacy principle:

- Keep local-first by default.
- If cloud processing is enabled later, require explicit user opt-in.

---

## 10. Implementation Deliverables Summary

MVP deliverables:

1. Installable PWA on iOS/Android.
2. Early integrated deployment on `jon2050.de/conspectus/webapp/` for device testing.
3. OneDrive-authenticated access to selected SQLite DB.
4. Cached offline viewing.
5. Accounts view.
6. Month-based transfers view with swipe.
7. Add-transfer write flow with desktop-compatible DB updates.
8. Settings recovery tools.
9. Documented test suite and release process.
