# Conspectus-Mobile - GitHub Issues (MVP)

This is a complete MVP issue backlog for GitHub Issues, aligned to the milestone plan.
Scope includes only MVP.
All issues are written so they can be copied into GitHub as-is.

## Issue Status Legend

- `:green_circle:` Open
- `:yellow_circle:` In Progress
- `:white_check_mark:` Done

Update each issue heading status marker to reflect current status.
## Label Set (create first)

- `feature`
- `infra`
- `bug`
- `docs`
- `test`
- `security`

## GitHub Milestones (create first)

- `M1 - Foundation`
- `M2 - Website Integration + Early Deploy`
- `M3 - Auth + OneDrive Binding`
- `M4 - Sync Engine + Cache`
- `M5 - Accounts + Transfers Read UX`
- `M6 - Add Transfer Write Path`
- `M7 - Settings + Recovery`
- `M8 - Hardening + QA + Release`

## Project Setup Issues

### :white_check_mark: PM-01 Create milestone and label taxonomy
- Labels: `infra`
- Milestone: none
- Depends on: none
- Implementation steps:
1. Create all milestones listed above.
2. Create all labels listed above.
3. Document usage rules in repo docs.
- Acceptance criteria:
1. Milestones and labels exist in GitHub.
2. Team has written rules for issue labeling.

### :white_check_mark: PM-02 Create issue templates
- Labels: `infra`
- Milestone: none
- Depends on: `PM-01`
- Implementation steps:
1. Add templates for feature, bug, infra, test.
2. Include required sections: context, tasks, acceptance criteria, test plan.
3. Add default labels and milestone placeholders.
- Acceptance criteria:
1. Templates are available in the repo.
2. New issues follow a consistent structure.

### :white_check_mark: PM-03 Create PR template with QS checklist
- Labels: `infra`
- Milestone: none
- Depends on: `PM-01`
- Implementation steps:
1. Add PR template with checks for lint, typecheck, tests, screenshots, and risk notes.
2. Add "no secrets" and "no breaking path/base URL" checks.
3. Require linked issue ID.
- Acceptance criteria:
1. PR template is active.
2. Every PR shows QS checklist items.

### :white_check_mark: PM-04 Configure branch protection and required checks
- Labels: `infra`
- Milestone: none
- Depends on: `PM-03`
- Implementation steps:
1. Protect `main`.
2. Require status checks for lint, typecheck, unit tests, build.
3. Block direct pushes to `main`.
- Acceptance criteria:
1. `main` cannot be merged without required checks.
2. QS gates are enforced centrally.

## Milestone 1 - Foundation

### :white_check_mark: M1-01 Bootstrap Svelte + TypeScript + Vite app
- Labels: `feature`
- Milestone: `M1 - Foundation`
- Depends on: `PM-01`
- Implementation steps:
1. Initialize app with Svelte + TypeScript.
2. Standardize npm scripts (`dev`, `build`, `preview`, `lint`, `test`, `typecheck`).
3. Commit baseline app shell.
- Acceptance criteria:
1. `npm run build` succeeds.
2. App runs locally with `npm run dev`.

### :white_check_mark: M1-02 Configure code quality tooling
- Labels: `infra`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Add ESLint + Prettier.
2. Add strict TypeScript settings.
3. Add scripts and fail-on-error behavior.
- Acceptance criteria:
1. Lint and typecheck run in CI and locally.
2. Repo has deterministic formatting behavior.

### :white_check_mark: M1-03 Add Vitest baseline
- Labels: `test`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Add Vitest config.
2. Add first smoke tests for utils and state store.
3. Wire test command into CI.
- Acceptance criteria:
1. Unit tests run in CI.
2. At least one test suite exists and passes.

### :white_check_mark: M1-04 Add Playwright baseline
- Labels: `test`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Add Playwright config and browser install step.
2. Add one app-shell smoke test.
3. Store traces/screenshots on failure.
- Acceptance criteria:
1. E2E smoke test runs in CI.
2. Failure artifacts are uploaded.

### :white_check_mark: M1-05 Configure vite-plugin-pwa and manifest
- Labels: `feature`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Add `vite-plugin-pwa`.
2. Define manifest name, icons, theme color, display mode.
3. Register service worker in app shell.
- Acceptance criteria:
1. Manifest is generated in production build.
2. Service worker registers successfully.

### :white_check_mark: M1-06 Prepare app architecture folders
- Labels: `infra`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Create folders: `auth`, `graph`, `db`, `cache`, `features`, `shared`.
2. Add index/barrel conventions and import aliases.
3. Add README per module with responsibilities.
- Acceptance criteria:
1. Folder structure matches architecture plan.
2. Import paths are stable and documented.

### :white_check_mark: M1-07 Add environment handling
- Labels: `infra`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Define required env vars (`VITE_AZURE_CLIENT_ID` and optional deployment vars).
2. Add runtime validation and friendly startup error.
3. Add `.env.example`.
- Acceptance criteria:
1. Missing required vars fail fast with clear message.
2. `.env.example` is complete.

### :white_check_mark: M1-08 Create baseline CI workflow
- Labels: `infra`
- Milestone: `M1 - Foundation`
- Depends on: `M1-02`, `M1-03`, `M1-04`
- Implementation steps:
1. Create GitHub Actions workflow for install, lint, typecheck, test, build.
2. Enable caching for npm dependencies.
3. Publish test artifacts on failure.
- Acceptance criteria:
1. Workflow runs on push and pull request.
2. Required checks are green for merge.

### :white_check_mark: M1-09 Build initial mobile-first app shell
- Labels: `feature`
- Milestone: `M1 - Foundation`
- Depends on: `M1-01`
- Implementation steps:
1. Create base layout with navigation placeholders.
2. Add route placeholders: Accounts, Transfers, Add, Settings.
3. Add loading and error boundary placeholder components.
4. Use Hash-based routing (`/#/transfers`) to ensure reliable direct-URL reloading under the `/conspectus/webapp/` subdirectory without requiring complex server-side redirects.
- Acceptance criteria:
1. App shell is navigable on mobile viewport.
2. Placeholder routes render without errors.
3. Routing uses hash-based paths, and direct reloads of routes do not 404.

## Milestone 2 - Website Integration + Early Deploy
### :green_circle: M2-01 Decide cross-repo deployment architecture
- Labels: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M1-08`
- Implementation steps:
1. Compare options: artifact handoff, submodule, subtree, package pull.
2. Choose one strategy and document rationale.
3. Document failure/rollback behavior for the chosen strategy.
- Acceptance criteria:
1. One approved deployment architecture is documented.
2. Both repos can implement it without manual copy steps.

### :green_circle: M2-02 Configure Vite base path for `/conspectus/webapp/`
- Labels: `feature`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-01`
- Implementation steps:
1. Set production base path to `/conspectus/webapp/`.
2. Verify routes, assets, manifest, and service worker scope.
3. Add tests for generated asset URLs.
4. Verify service worker scope is limited to `/conspectus/webapp/` and does not intercept parent website routes.
- Acceptance criteria:
1. Built assets resolve correctly under subdirectory hosting.
2. No root-path leakage in generated files.
3. Service worker scope is limited to `/conspectus/webapp/`.
4. Parent site routes (`jon2050.de/`) are not intercepted by service worker.
5. `start_url` in manifest resolves correctly under subdirectory path.

### :green_circle: M2-03 Create PWA deploy workflow in PWA repo
- Labels: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-01`, `M2-02`
- Implementation steps:
1. Build production bundle in CI.
2. Publish artifact for website repo consumption.
3. Tag artifact with commit SHA and timestamp.
- Acceptance criteria:
1. Every successful build emits a deployable artifact.
2. Artifact metadata is traceable.

### :green_circle: M2-04 Integrate PWA artifact consumption in website repo CI
- Labels: `infra`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-03`
- Implementation steps:
1. Add CI job in website repo to fetch approved PWA artifact.
2. Publish files to `conspectus/webapp/` output location.
3. Enforce atomic replace behavior.
- Acceptance criteria:
1. Website pipeline deploys PWA files automatically.
2. Deploy does not break non-Conspectus website content.

### :green_circle: M2-05 Add deployment smoke checks in website pipeline
- Labels: `test`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-04`
- Implementation steps:
1. Add HTTP checks for app route, manifest, and service worker URLs.
2. Add HTML response sanity check for app bootstrap.
3. Fail deploy if checks fail.
- Acceptance criteria:
1. Pipeline blocks bad deployments.
2. Smoke checks run after every deploy.

### :green_circle: M2-06 Add early public test page/link
- Labels: `feature`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-04`
- Implementation steps:
1. Add website link entry for the PWA route.
2. Add temporary "beta" marker if needed.
3. Verify routing from landing page to app path.
- Acceptance criteria:
1. Users can navigate to PWA from website.
2. Link survives full website rebuild.

### :green_circle: M2-07 Verify iOS and Android installability on production URL
- Labels: `test`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-05`, `M2-06`
- Implementation steps:
1. Test Add to Home Screen flow on iOS Safari and Android Chrome.
2. Verify icon, app name, and launch behavior.
3. Record issues with screenshots.
- Acceptance criteria:
1. Install flow works on both platforms.
2. Documented issues are tracked as bugs.

### :green_circle: M2-08 Add deployment runbook for two-repo flow
- Labels: `docs`
- Milestone: `M2 - Website Integration + Early Deploy`
- Depends on: `M2-04`, `M2-05`
- Implementation steps:
1. Document trigger conditions for deploy.
2. Document rollback steps and owner responsibilities.
3. Document how to hotfix only PWA without full website regression.
- Acceptance criteria:
1. Runbook exists in repo docs.
2. Another developer can deploy using only runbook instructions.

## Milestone 3 - Auth + OneDrive Binding

### :green_circle: M3-01 Create Microsoft Entra app registration (SPA, personal accounts)
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M1-07`
- Implementation steps:
1. Create app registration for SPA.
2. Configure account type for personal Microsoft accounts.
3. Add local and production redirect URIs.
- Acceptance criteria:
1. App registration exists with correct redirect URIs.
2. Client ID is available for frontend configuration.

### :green_circle: M3-02 Configure Graph scopes and consent documentation
- Labels: `security`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-01`
- Implementation steps:
1. Define least-privilege delegated scopes required for file read/write.
2. Configure scopes in Entra app.
3. Document consent and rationale.
- Acceptance criteria:
1. Only required scopes are requested.
2. Scope list is documented and approved.

### :green_circle: M3-03 Implement MSAL bootstrap module
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-01`
- Implementation steps:
1. Add MSAL initialization with PKCE flow.
2. Implement token acquisition helper with silent-first strategy.
3. Handle account selection and active account restoration.
- Acceptance criteria:
1. Tokens can be acquired without repeated login when session exists.
2. Auth module exposes stable API to UI/Graph layers.

### :green_circle: M3-04 Build sign-in/sign-out UX
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-03`
- Implementation steps:
1. Add sign-in and sign-out actions to UI.
2. Add loading and error states for auth operations.
3. Show current signed-in account summary.
4. Test auth flow on target mobile platforms.
- Acceptance criteria:
1. User can sign in and sign out reliably.
2. UI states are clear for success, pending, and error.
3. Auth flow works in iOS Safari browser.
4. Auth flow works from iOS home-screen PWA install.
5. Auth flow works on Android Chrome.

### :green_circle: M3-05 Implement Graph client wrapper
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-03`
- Implementation steps:
1. Implement typed wrapper for Graph API calls used by MVP.
2. Inject bearer tokens from auth module.
3. Normalize error mapping for UI handling.
- Acceptance criteria:
1. Graph calls are centralized behind one client interface.
2. Common Graph errors are mapped to user-facing categories.

### :green_circle: M3-06 Implement OneDrive file selection flow
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-05`
- Implementation steps:
1. Implement file browse/select for `.db` target.
2. Capture `driveId`, `itemId`, file `name`, and `parentReference` (folder path).
3. Validate selection data before storing.
- Acceptance criteria:
1. User can select a DB file once.
2. Selection returns all required identifiers including path for self-healing fallback.

### :green_circle: M3-07 Persist binding in local storage layer
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-06`
- Implementation steps:
1. Persist selected file identifiers (`driveId`, `itemId`, `name`, `parentReference`/path).
2. Load binding at startup.
3. Add schema versioning for local metadata store.
- Acceptance criteria:
1. Binding survives app restart.
2. Binding can be read without extra network calls.

### :green_circle: M3-08 Add settings actions for rebind and local reset
- Labels: `feature`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-07`
- Implementation steps:
1. Add "Change DB file" action.
2. Add "Reset local app data" action.
3. Add confirmation dialogs for destructive local resets.
- Acceptance criteria:
1. Rebind flow works end-to-end.
2. Reset clears local binding and cache reliably.

### :green_circle: M3-09 Add auth and binding integration tests
- Labels: `test`
- Milestone: `M3 - Auth + OneDrive Binding`
- Depends on: `M3-04`, `M3-06`, `M3-07`
- Implementation steps:
1. Add tests for login state transitions.
2. Add tests for binding persistence and reload.
3. Add tests for failed token and failed selection flows.
- Acceptance criteria:
1. Core auth/binding flows are covered in CI.
2. Failure modes are asserted, not only happy paths.

## Milestone 4 - Sync Engine + Cache
### :green_circle: M4-01 Define Dexie schema for DB cache and metadata
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M3-07`
- Implementation steps:
1. Define stores for DB bytes and sync metadata.
2. Include keys for `driveId`, `itemId`, `eTag`, and `lastSyncAt`.
3. Add migration strategy for future schema updates.
- Acceptance criteria:
1. Cache schema supports all MVP sync requirements.
2. Schema migration path is documented.

### :green_circle: M4-02 Implement Graph metadata fetch (`eTag` and file info)
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M3-05`
- Implementation steps:
1. Fetch file metadata for bound item.
2. Extract and validate `eTag`.
3. Map Graph metadata errors.
- Acceptance criteria:
1. Metadata fetch returns stable `eTag`.
2. Missing/invalid metadata is handled safely.

### :green_circle: M4-03 Implement file download and cache write
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M4-01`, `M4-02`
- Implementation steps:
1. Download DB bytes from Graph.
2. Persist bytes and metadata in cache.
3. Verify byte integrity before marking sync complete.
- Acceptance criteria:
1. Fresh DB can be cached from OneDrive.
2. Corrupt/empty payloads do not overwrite valid cache silently.

### :green_circle: M4-04 Implement startup freshness decision tree
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M4-02`, `M4-03`
- Implementation steps:
1. Implement branches: online unchanged, online changed, offline with cache, offline no cache.
2. Expose deterministic state outputs.
3. Add telemetry/logging in development mode.
- Acceptance criteria:
1. Startup behavior matches architecture decision tree.
2. Offline startup works with existing cache.

### :green_circle: M4-05 Implement sync state machine for UI
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M4-04`
- Implementation steps:
1. Add states: syncing, synced, stale, offline, error.
2. Expose state transitions to UI.
3. Prevent illegal transitions.
- Acceptance criteria:
1. UI always shows one valid sync status.
2. State transitions are reproducible in tests.

### :green_circle: M4-06 Add retry and backoff for transient sync failures
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M4-03`, `M4-04`
- Implementation steps:
1. Add exponential backoff with cap.
2. Retry only retryable status classes.
3. Surface final failure with actionable message.
- Acceptance criteria:
1. Transient failures retry automatically.
2. Non-retryable failures fail fast with clear reason.

### :green_circle: M4-07 Add sync/cache integration tests
- Labels: `test`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M4-04`, `M4-05`, `M4-06`
- Implementation steps:
1. Test startup decision matrix.
2. Test retry behavior and terminal failure behavior.
3. Test offline startup with cache and without cache.
- Acceptance criteria:
1. Sync logic has deterministic tests for all branches.
2. Regressions are caught in CI.

### :green_circle: M4-08 Implement progress feedback for DB sync and upload operations
- Labels: `feature`
- Milestone: `M4 - Sync Engine + Cache`
- Depends on: `M4-05`
- Implementation steps:
1. Add progress indicator for initial DB download and cache-miss re-downloads.
2. Add progress indicator for DB upload after transfer creation.
3. Ensure progress states are clear during slow mobile connections.
- Acceptance criteria:
1. User sees loading/progress feedback during DB download.
2. User sees upload progress feedback when saving a new transfer.
3. Progress indicators work correctly on slow network conditions.

## Milestone 5 - Accounts + Transfers Read UX

### :green_circle: M5-01 Integrate sql.js runtime and DB open service
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M4-03`
- Implementation steps:
1. Load sql.js WASM bundle.
2. Implement DB open/close lifecycle from cached bytes.
3. Set required SQLite pragmas and error handling.
- Acceptance criteria:
1. DB can be opened from cached/downloaded bytes.
2. DB lifecycle is stable across app reloads.

### :green_circle: M5-02 Implement account query service
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-01`
- Implementation steps:
1. Implement visible non-primary account query.
2. Implement deterministic sorting.
3. Map result rows to typed frontend models.
- Acceptance criteria:
1. Query returns expected accounts and sort order.
2. Results render without runtime parsing errors.

### :green_circle: M5-03 Implement transfer-by-month query service
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-01`
- Implementation steps:
1. Add epoch-day month-bound utilities.
2. Query transfers with inclusive month range.
3. Sort by date ascending and transfer ID tie-breaker.
- Acceptance criteria:
1. Month query results match expected desktop semantics.
2. Boundary dates are included correctly.

### :green_circle: M5-04 Implement month navigation state and gestures
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-03`
- Implementation steps:
1. Default to current month.
2. Implement previous/next controls and swipe handlers.
3. Add fallback controls for non-gesture usage.
- Acceptance criteria:
1. Month switching works by swipe and buttons.
2. Current month logic is stable and test-covered.

### :green_circle: M5-05 Build Accounts screen UI
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-02`
- Implementation steps:
1. Create account card/list components.
2. Apply positive/negative amount styling.
3. Add loading and empty states.
4. Apply CSS `env(safe-area-inset-bottom)` to ensure the bottom navigation does not overlap with the iOS home bar or Android gesture hints.
- Acceptance criteria:
1. Accounts are readable on mobile widths.
2. Amount color semantics are consistent.
3. Bottom navigation is fully accessible and visually distinct from OS-level safe areas on notched/bezelless devices.

### :green_circle: M5-06 Build Transfers screen UI
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-03`, `M5-04`
- Implementation steps:
1. Build transfer list item component.
2. Show date, name, amount, account context, categories.
3. Add loading, empty, and error visuals.
- Acceptance criteria:
1. Transfers are readable and sortable by month.
2. Empty month state is explicit and clear.

### :green_circle: M5-07 Add formatting utilities and localization-ready rendering
- Labels: `feature`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-05`, `M5-06`
- Implementation steps:
1. Add money formatting from integer cents.
2. Add date formatting from epoch-day.
3. Keep formatting utilities unit tested.
- Acceptance criteria:
1. Currency and dates render correctly.
2. Utilities are reusable across screens.

### :green_circle: M5-08 Add read-flow tests (unit + integration + e2e smoke)
- Labels: `test`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: `M5-02`, `M5-03`, `M5-06`
- Implementation steps:
1. Unit test query mappers and date bounds.
2. Integration test screen rendering from fixture DB.
3. Add E2E smoke for month navigation.
- Acceptance criteria:
1. Read path is covered by automated tests.
2. Regression risk for month logic is reduced.

### :green_circle: M5-09 Capture live DB schema as reference artifact
- Labels: `docs`
- Milestone: `M5 - Accounts + Transfers Read UX`
- Depends on: none
- Implementation steps:
1. Export schema from a real Conspectus DB using `SELECT sql FROM sqlite_master`.
2. Store the output as a reference schema file in the repository.
3. Use this as the single source of truth for PWA SQL queries instead of conflicting desktop repo schema files.
- Acceptance criteria:
1. A live schema snapshot exists in the repo.
2. All PWA SQL queries are validated against this snapshot.

## Milestone 6 - Add Transfer Write Path
### :green_circle: M6-01 Build Add Transfer form UI (bottom sheet)
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M5-06`
- Implementation steps:
1. Implement fields: date, name, amount, from, to, categories, buyplace.
2. Add touch-friendly controls and keyboard-safe layout.
3. Add form-level loading/error states.
- Acceptance criteria:
1. Form is fully usable on iOS and Android screen sizes.
2. All MVP fields are present and editable.

### :green_circle: M6-02 Implement account/category options loading for form
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M5-01`
- Implementation steps:
1. Query valid `from` account options.
2. Query valid `to` account options.
3. Query categories sorted by name.
- Acceptance criteria:
1. Options match desktop intent.
2. Category selection supports 0 to 3 categories.

### :green_circle: M6-03 Implement transfer validation rules
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-01`, `M6-02`
- Implementation steps:
1. Validate name length > 2.
2. Validate amount > 0.
3. Validate account combination restrictions.
- Acceptance criteria:
1. Invalid forms are blocked client-side.
2. Validation messages are specific and actionable.

### :green_circle: M6-04 Implement transfer type derivation logic
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-02`
- Implementation steps:
1. Load account types for selected accounts.
2. Derive transfer type ID based on primary account rules.
3. Add tests for all branch combinations.
- Acceptance criteria:
1. Derived transfer type matches desktop semantics.
2. All branches are test-covered.

### :green_circle: M6-05 Implement SQL write transaction
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-03`, `M6-04`
- Implementation steps:
1. Insert transfer row.
2. Update source account amount (`-amount`).
3. Update destination account amount (`+amount`) in one transaction.
- Acceptance criteria:
1. Transaction rolls back on any statement failure.
2. Account balances and transfer row remain consistent.

### :green_circle: M6-06 Implement DB export after successful local write
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-05`
- Implementation steps:
1. Export DB bytes from sql.js.
2. Validate non-empty payload.
3. Hand off bytes to upload module.
- Acceptance criteria:
1. Export runs only after local commit success.
2. Export output is usable for upload.

### :green_circle: M6-07 Implement Graph upload with `If-Match` eTag
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-06`, `M4-02`
- Implementation steps:
1. Upload full DB bytes with `If-Match`.
2. Handle success and eTag refresh.
3. Handle precondition failure conflicts.
- Acceptance criteria:
1. Successful writes update remote DB and local eTag.
2. Conflict responses are surfaced clearly.

### :green_circle: M6-08 Implement write failure and retry UX
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-07`
- Implementation steps:
1. Keep unsent form data on upload failure.
2. Add retry action without retyping full form.
3. Prevent false-success UI states.
4. Handle token expiry during upload: silently re-acquire token, retry upload, and preserve local state.
5. Upon successful upload, display a clear visual success message (e.g. checkmark toast or distinct animation).
- Acceptance criteria:
1. User can retry failed uploads safely.
2. App never reports success before upload completes.
3. User sees a distinct visual confirmation only after the transfer is fully saved and uploaded.
4. Token expiry during upload is recovered transparently without losing form data or local DB state.

### :green_circle: M6-09 Block write flow while offline
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-01`
- Implementation steps:
1. Detect offline state before submit.
2. Disable submit action with clear explanation.
3. Display a prominent warning message indicating the app is offline and transfers cannot be saved.
4. Re-enable automatically when online.
- Acceptance criteria:
1. Offline write attempts are prevented.
2. User message clearly explains online requirement.
3. User is visually warned of the offline state before attempting to submit.

### :green_circle: M6-10 Add write-path tests (unit/integration/e2e)
- Labels: `test`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-05`, `M6-07`, `M6-08`, `M6-09`
- Implementation steps:
1. Unit test validations and transfer type derivation.
2. Integration test SQL transaction behavior.
3. E2E test happy path, conflict, and retry scenarios.
- Acceptance criteria:
1. Core write path is fully automated in CI.
2. Conflict and failure states are explicitly tested.

### :green_circle: M6-11 Implement eTag conflict resolution UX
- Labels: `feature`
- Milestone: `M6 - Add Transfer Write Path`
- Depends on: `M6-07`, `M6-08`
- Implementation steps:
1. When upload returns `412 Precondition Failed` (eTag mismatch), show a conflict dialog.
2. Offer option to download the latest DB version from OneDrive.
3. Preserve the form data from the failed transfer so the user can re-enter it after sync.
4. IMPORTANT: Fully destroy and re-initialize the `sql.js` database in memory with the newly fetched bytes before the user can click save again, preventing stale overwrites.
5. After re-sync, allow the user to retry the transfer creation with the fresh DB.
- Acceptance criteria:
1. eTag conflict is surfaced with a clear, non-technical message.
2. User does not lose already-entered form data on conflict.
3. User can recover by syncing and re-submitting without restarting the app, and the local DB state is safely reset.

## Milestone 7 - Settings + Recovery

### :green_circle: M7-01 Build Settings screen sections
- Labels: `feature`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M3-08`, `M4-05`
- Implementation steps:
1. Show bound file details and last sync timestamp.
2. Show app version/build info.
3. Group actions by risk level.
- Acceptance criteria:
1. Settings data is accurate and readable.
2. Actions are discoverable and clear.

### :green_circle: M7-02 Implement force refresh action
- Labels: `feature`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M4-04`
- Implementation steps:
1. Add manual refresh trigger.
2. Re-run metadata check and download flow.
3. Update sync status and timestamps.
- Acceptance criteria:
1. Force refresh executes predictable sync behavior.
2. UI clearly indicates progress and result.

### :green_circle: M7-03 Add operational safety notice and data recovery documentation
- Labels: `docs`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M7-01`
- Implementation steps:
1. Add warning card: do not use mobile and desktop app concurrently.
2. Link to short explanation.
3. Keep wording concise and unambiguous.
4. Document that OneDrive version history (30 days for personal accounts) serves as the data recovery mechanism for accidental or incorrect writes.
5. Add brief recovery instructions or link explaining how to restore a previous file version via OneDrive web UI.
- Acceptance criteria:
1. Safety warning is visible in Settings.
2. Message is understandable without technical jargon.
3. Data recovery path via OneDrive version history is documented and discoverable by the user.

### :green_circle: M7-04 Implement stale token recovery flow
- Labels: `feature`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M3-03`, `M3-04`
- Implementation steps:
1. Detect token-expired API failures.
2. Trigger safe re-auth flow.
3. Return user to previous screen after success.
- Acceptance criteria:
1. Expired token scenario is recoverable in-app.
2. User context is preserved after re-auth.

### :green_circle: M7-05 Implement missing/moved OneDrive file recovery
- Labels: `feature`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M3-06`, `M4-02`
- Implementation steps:
1. Detect not-found/moved file responses (404) for `itemId`.
2. Attempt self-healing fallback: query Graph using the saved `parentReference` (path) and file `name` to get the new `itemId` (handles Desktop safe-saves).
3. If fallback fails, prompt for rebind flow.
4. Preserve safe local state during recovery.
- Acceptance criteria:
1. App silently self-heals if the file `itemId` changed due to a desktop safe-save but the path/name remains identical.
2. Missing file does not break entire app state.
3. User can recover by selecting a new file if self-healing fails.

### :green_circle: M7-06 Implement diagnostics panel with copy action
- Labels: `feature`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M7-01`
- Implementation steps:
1. Show auth/network/sync/binding diagnostic values.
2. Add one-tap copy for support text.
3. Ensure no sensitive tokens are exposed.
- Acceptance criteria:
1. Diagnostics are useful for support troubleshooting.
2. Copied text excludes secrets.

### :green_circle: M7-07 Add recovery-flow tests
- Labels: `test`
- Milestone: `M7 - Settings + Recovery`
- Depends on: `M7-04`, `M7-05`, `M7-06`
- Implementation steps:
1. Test expired token recovery.
2. Test missing file recovery/rebind path.
3. Test reset and force refresh actions.
- Acceptance criteria:
1. Recovery-critical paths are covered in CI.
2. Regressions in recovery flows are detectable.

## Milestone 8 - Hardening + QA + Release

### :green_circle: M8-01 Implement CSP and security headers for PWA path
- Labels: `security`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M2-04`
- Implementation steps:
1. Define CSP compatible with Svelte/Vite build output.
2. Apply headers for PWA route on website hosting.
3. Validate service worker and manifest still function.
- Acceptance criteria:
1. Security headers are active in production.
2. App behavior remains correct under CSP constraints.

### :green_circle: M8-02 Implement PWA Service Worker Update Flow
- Labels: `feature`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M1-05`
- Implementation steps:
1. Configure `vite-plugin-pwa` to prompt for updates (`promptForUpdate` strategy).
2. Add an "Update Available" toast/banner component to the UI.
3. Expose a button to accept the update and trigger a page reload.
- Acceptance criteria:
1. When a new deployment happens, active clients receive an update notification.
2. Users do not get permanently stuck on stale cached app shells.

### :green_circle: M8-03 Add dependency vulnerability scanning
- Labels: `security`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M1-08`
- Implementation steps:
1. Add npm audit or equivalent scanner in CI.
2. Fail on high/critical vulnerabilities.
3. Track exceptions explicitly when unavoidable.
- Acceptance criteria:
1. Vulnerability scan runs on PR and scheduled basis.
2. High/critical findings block release.

### :green_circle: M8-04 Add bundle size budget checks
- Labels: `infra`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M1-08`
- Implementation steps:
1. Define JS/CSS size budgets.
2. Add CI check for budget regression.
3. Document optimization steps when budget exceeded.
- Acceptance criteria:
1. Bundle budget check runs in CI.
2. Significant size regressions fail PR checks.

### :green_circle: M8-05 Add Lighthouse CI checks for mobile performance
- Labels: `test`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M2-05`
- Implementation steps:
1. Add Lighthouse CI against deployed preview/prod route.
2. Track performance, accessibility, best practices, PWA.
3. Define minimum thresholds.
- Acceptance criteria:
1. Lighthouse reports are generated automatically.
2. Scores meet agreed thresholds for release.

### :green_circle: M8-06 Expand Playwright suite to critical user journeys
- Labels: `test`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M6-10`, `M7-07`
- Implementation steps:
1. Add flows: login, bind file, read accounts/transfers, add transfer, retry.
2. Add offline-read smoke scenario.
3. Add flaky-test mitigation and retries policy.
- Acceptance criteria:
1. Critical journeys are automated.
2. E2E suite is stable enough for release gating.

### :green_circle: M8-07 Create manual device QA checklist issue
- Labels: `test`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M2-07`, `M6-10`, `M7-07`
- Implementation steps:
1. Define iOS Safari and Android Chrome test matrix.
2. Define exact smoke scenarios and pass/fail criteria.
3. Record results in release PR.
- Acceptance criteria:
1. Manual matrix is run before release.
2. Results are attached and traceable.

### :green_circle: M8-08 Create release checklist and cut process
- Labels: `docs`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M8-05`, `M8-06`
- Implementation steps:
1. Define release branch/tag strategy.
2. Define required checks and approvers.
3. Define release notes and post-deploy verification steps.
- Acceptance criteria:
1. Release process is documented and repeatable.
2. Every release follows one checklist.

### :green_circle: M8-09 Create rollback procedure for two-repo deployment
- Labels: `docs`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M2-08`
- Implementation steps:
1. Define rollback trigger conditions.
2. Define technical rollback steps in both repos.
3. Define communication and ownership during rollback.
- Acceptance criteria:
1. Rollback can be executed in under 15 minutes.
2. Procedure is verified in a dry run.

### :green_circle: M8-10 Add post-deploy smoke monitor job
- Labels: `infra`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: `M2-05`
- Implementation steps:
1. Add scheduled check of app route and key assets.
2. Alert on repeated failures.
3. Include deploy SHA in alert metadata.
- Acceptance criteria:
1. Basic availability monitoring exists.
2. Alerts contain enough context for fast triage.

### :green_circle: M8-11 Final MVP release issue
- Labels: `feature`
- Milestone: `M8 - Hardening + QA + Release`
- Depends on: all milestone issues
- Implementation steps:
1. Verify all milestone issues are closed.
2. Execute release checklist and deployment.
3. Publish release notes and known limitations.
- Acceptance criteria:
1. MVP is deployed at `https://jon2050.de/conspectus/webapp/`.
2. Release notes and QA evidence are attached.

## Suggested Issue Creation Order

1. Create all `PM-*` issues.
2. Create all issues in milestone order (`M1` to `M8`).
3. Link dependencies during creation using issue references.


